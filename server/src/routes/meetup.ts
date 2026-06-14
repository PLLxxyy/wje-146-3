import { Router, Response } from 'express';
import { db } from '../db';
import { AuthRequest } from '../middleware/auth';
import { Meetup, MeetupRegistration } from '../types';

const router = Router();

router.get('/', (req: AuthRequest, res: Response) => {
  const { status, page = '1', pageSize = '20' } = req.query;
  const pageNum = parseInt(page as string) || 1;
  const size = parseInt(pageSize as string) || 20;
  const offset = (pageNum - 1) * size;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (status) {
    whereClause += ' AND m.status = ?';
    params.push(status);
  }

  const countRow = db.prepare(
    `SELECT COUNT(*) as total FROM meetups m ${whereClause}`
  ).get(...params) as { total: number };

  const meetups = db.prepare(
    `SELECT m.*, u.nickname as user_nickname, u.avatar as user_avatar,
            (SELECT COUNT(*) FROM meetup_registrations WHERE meetup_id = m.id AND status = 'registered') as current_participants
     FROM meetups m
     LEFT JOIN users u ON m.user_id = u.id
     ${whereClause}
     ORDER BY m.created_at DESC
     LIMIT ? OFFSET ?`
  ).all(...params, size, offset) as Meetup[];

  res.json({ meetups, total: countRow.total, page: pageNum, pageSize: size });
});

router.post('/', (req: AuthRequest, res: Response) => {
  const { title, description, location, meetup_time, max_participants } = req.body;

  if (!title || !location || !meetup_time || !max_participants) {
    res.status(400).json({ error: '请填写活动标题、地点、时间和人数上限' });
    return;
  }

  if (max_participants < 2) {
    res.status(400).json({ error: '人数上限至少为2人' });
    return;
  }

  const result = db.prepare(
    'INSERT INTO meetups (user_id, title, description, location, meetup_time, max_participants) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.userId!, title, description || '', location, meetup_time, max_participants);

  const meetup = db.prepare(
    `SELECT m.*, u.nickname as user_nickname, u.avatar as user_avatar
     FROM meetups m
     LEFT JOIN users u ON m.user_id = u.id
     WHERE m.id = ?`
  ).get(result.lastInsertRowid) as Meetup;

  res.json({ meetup });
});

router.get('/mine', (req: AuthRequest, res: Response) => {
  const meetups = db.prepare(
    `SELECT m.*,
            (SELECT COUNT(*) FROM meetup_registrations WHERE meetup_id = m.id AND status = 'registered') as current_participants
     FROM meetups m
     WHERE m.user_id = ?
     ORDER BY m.created_at DESC`
  ).all(req.userId!) as Meetup[];

  res.json({ meetups });
});

router.get('/registered', (req: AuthRequest, res: Response) => {
  const meetups = db.prepare(
    `SELECT m.*, u.nickname as user_nickname, u.avatar as user_avatar,
            (SELECT COUNT(*) FROM meetup_registrations WHERE meetup_id = m.id AND status = 'registered') as current_participants,
            mr.status as my_status
     FROM meetup_registrations mr
     LEFT JOIN meetups m ON mr.meetup_id = m.id
     LEFT JOIN users u ON m.user_id = u.id
     WHERE mr.user_id = ?
     ORDER BY mr.created_at DESC`
  ).all(req.userId!) as (Meetup & { my_status: string })[];

  res.json({ meetups });
});

router.post('/:id/register', (req: AuthRequest, res: Response) => {
  const meetupId = req.params.id;

  const meetup = db.prepare('SELECT * FROM meetups WHERE id = ?').get(meetupId) as Meetup | undefined;
  if (!meetup) {
    res.status(404).json({ error: '活动不存在' });
    return;
  }

  if (meetup.user_id === req.userId!) {
    res.status(400).json({ error: '不能报名自己发起的活动' });
    return;
  }

  if (meetup.status !== 'open') {
    res.status(400).json({ error: '该活动已关闭报名' });
    return;
  }

  const existingReg = db.prepare(
    'SELECT id FROM meetup_registrations WHERE meetup_id = ? AND user_id = ?'
  ).get(meetupId, req.userId!);

  if (existingReg) {
    res.status(400).json({ error: '您已报名该活动' });
    return;
  }

  const currentCount = db.prepare(
    "SELECT COUNT(*) as count FROM meetup_registrations WHERE meetup_id = ? AND status = 'registered'"
  ).get(meetupId) as { count: number };

  if (currentCount.count >= meetup.max_participants) {
    res.status(400).json({ error: '该活动报名人数已满' });
    return;
  }

  const result = db.prepare(
    'INSERT INTO meetup_registrations (meetup_id, user_id) VALUES (?, ?)'
  ).run(meetupId, req.userId!);

  const updatedCount = db.prepare(
    "SELECT COUNT(*) as count FROM meetup_registrations WHERE meetup_id = ? AND status = 'registered'"
  ).get(meetupId) as { count: number };

  if (updatedCount.count >= meetup.max_participants) {
    db.prepare('UPDATE meetups SET status = ? WHERE id = ?').run('full', meetupId);
  }

  const registration = db.prepare('SELECT * FROM meetup_registrations WHERE id = ?').get(result.lastInsertRowid) as MeetupRegistration;

  res.json({ registration });
});

router.post('/:id/cancel', (req: AuthRequest, res: Response) => {
  const meetupId = req.params.id;

  const reg = db.prepare(
    'SELECT * FROM meetup_registrations WHERE meetup_id = ? AND user_id = ? AND status = ?'
  ).get(meetupId, req.userId!, 'registered') as MeetupRegistration | undefined;

  if (!reg) {
    res.status(400).json({ error: '您未报名该活动' });
    return;
  }

  db.prepare('UPDATE meetup_registrations SET status = ? WHERE id = ?').run('cancelled', reg.id);

  const meetup = db.prepare('SELECT * FROM meetups WHERE id = ?').get(meetupId) as Meetup;
  if (meetup.status === 'full') {
    db.prepare('UPDATE meetups SET status = ? WHERE id = ?').run('open', meetupId);
  }

  res.json({ message: '已取消报名' });
});

router.get('/:id/registrations', (req: AuthRequest, res: Response) => {
  const meetup = db.prepare('SELECT * FROM meetups WHERE id = ?').get(req.params.id) as Meetup | undefined;
  if (!meetup) {
    res.status(404).json({ error: '活动不存在' });
    return;
  }

  if (meetup.user_id !== req.userId!) {
    res.status(403).json({ error: '无权查看' });
    return;
  }

  const registrations = db.prepare(
    `SELECT mr.*, u.nickname as user_nickname, u.avatar as user_avatar
     FROM meetup_registrations mr
     LEFT JOIN users u ON mr.user_id = u.id
     WHERE mr.meetup_id = ?
     ORDER BY mr.created_at ASC`
  ).all(req.params.id) as MeetupRegistration[];

  res.json({ registrations, meetup });
});

router.post('/:id/remove/:userId', (req: AuthRequest, res: Response) => {
  const meetup = db.prepare('SELECT * FROM meetups WHERE id = ?').get(req.params.id) as Meetup | undefined;
  if (!meetup) {
    res.status(404).json({ error: '活动不存在' });
    return;
  }

  if (meetup.user_id !== req.userId!) {
    res.status(403).json({ error: '无权操作' });
    return;
  }

  db.prepare(
    "UPDATE meetup_registrations SET status = 'removed' WHERE meetup_id = ? AND user_id = ? AND status = 'registered'"
  ).run(req.params.id, req.params.userId);

  if (meetup.status === 'full') {
    db.prepare('UPDATE meetups SET status = ? WHERE id = ?').run('open', req.params.id);
  }

  res.json({ message: '已移除该报名' });
});

router.put('/:id/close', (req: AuthRequest, res: Response) => {
  const meetup = db.prepare('SELECT * FROM meetups WHERE id = ?').get(req.params.id) as Meetup | undefined;
  if (!meetup) {
    res.status(404).json({ error: '活动不存在' });
    return;
  }

  if (meetup.user_id !== req.userId!) {
    res.status(403).json({ error: '无权操作' });
    return;
  }

  db.prepare('UPDATE meetups SET status = ? WHERE id = ?').run('closed', req.params.id);
  res.json({ message: '活动已关闭' });
});

router.put('/:id/cancel-meetup', (req: AuthRequest, res: Response) => {
  const meetup = db.prepare('SELECT * FROM meetups WHERE id = ?').get(req.params.id) as Meetup | undefined;
  if (!meetup) {
    res.status(404).json({ error: '活动不存在' });
    return;
  }

  if (meetup.user_id !== req.userId!) {
    res.status(403).json({ error: '无权操作' });
    return;
  }

  db.prepare('UPDATE meetups SET status = ? WHERE id = ?').run('cancelled', req.params.id);
  res.json({ message: '活动已取消' });
});

export default router;
