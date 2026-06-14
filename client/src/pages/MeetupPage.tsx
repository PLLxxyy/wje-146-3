import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { Meetup, MeetupRegistration } from '../types';
import { formatDate } from '../utils';

function getMeetupStatusTag(status: string): { className: string; text: string } {
  switch (status) {
    case 'open': return { className: 'tag-open', text: '报名中' };
    case 'full': return { className: 'tag-matched', text: '已满员' };
    case 'closed': return { className: 'tag-completed', text: '已关闭' };
    case 'cancelled': return { className: 'tag-cancelled', text: '已取消' };
    default: return { className: '', text: status };
  }
}

export default function MeetupPage() {
  const { user } = useAuth();
  const [meetups, setMeetups] = useState<Meetup[]>([]);
  const [myMeetups, setMyMeetups] = useState<Meetup[]>([]);
  const [registeredMeetups, setRegisteredMeetups] = useState<Meetup[]>([]);
  const [tab, setTab] = useState<'browse' | 'mine' | 'registered'>('browse');
  const [loading, setLoading] = useState(true);
  const [showPublish, setShowPublish] = useState(false);
  const [showRegistrations, setShowRegistrations] = useState<number | null>(null);
  const [registrations, setRegistrations] = useState<MeetupRegistration[]>([]);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [publishForm, setPublishForm] = useState({
    title: '',
    description: '',
    location: '',
    meetup_time: '',
    max_participants: 10,
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const allRes = await api.getPublicMeetups();
      setMeetups(allRes.meetups);
      if (user) {
        const [myRes, regRes] = await Promise.all([
          api.getMyMeetups(),
          api.getRegisteredMeetups(),
        ]);
        setMyMeetups(myRes.meetups);
        setRegisteredMeetups(regRes.meetups);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!publishForm.title || !publishForm.location || !publishForm.meetup_time || !publishForm.max_participants) {
      setFormError('请填写活动标题、地点、时间和人数上限');
      return;
    }
    setFormLoading(true);
    try {
      await api.createMeetup(publishForm);
      setShowPublish(false);
      setPublishForm({ title: '', description: '', location: '', meetup_time: '', max_participants: 10 });
      fetchAll();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleRegister = async (meetupId: number) => {
    if (!user) return;
    try {
      await api.registerMeetup(meetupId);
      alert('报名成功！');
      fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCancelRegistration = async (meetupId: number) => {
    try {
      await api.cancelMeetupRegistration(meetupId);
      alert('已取消报名');
      fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleViewRegistrations = async (meetupId: number) => {
    setShowRegistrations(meetupId);
    try {
      const res = await api.getMeetupRegistrations(meetupId);
      setRegistrations(res.registrations);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveRegistration = async (meetupId: number, userId: number) => {
    try {
      await api.removeMeetupRegistration(meetupId, userId);
      alert('已移除该报名');
      handleViewRegistrations(meetupId);
      fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCloseMeetup = async (meetupId: number) => {
    try {
      await api.closeMeetup(meetupId);
      alert('活动已关闭报名');
      fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCancelMeetup = async (meetupId: number) => {
    if (!confirm('确定要取消该活动吗？取消后所有报名将失效。')) return;
    try {
      await api.cancelMeetup(meetupId);
      alert('活动已取消');
      fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const isRegistered = (meetupId: number) => {
    return registeredMeetups.some(m => m.id === meetupId && m.my_status === 'registered');
  };

  const renderMeetupCard = (meetup: Meetup, showOwnerActions: boolean = false) => {
    const statusTag = getMeetupStatusTag(meetup.status);
    const current = meetup.current_participants || 0;
    const canRegister = user && meetup.status === 'open' && meetup.user_id !== user.id && !isRegistered(meetup.id);
    const canCancelReg = user && isRegistered(meetup.id);

    return (
      <div key={meetup.id} className="meetup-card">
        <div className="meetup-card-header">
          <h3>{meetup.title}</h3>
          <span className={`tag ${statusTag.className}`}>{statusTag.text}</span>
        </div>
        <div className="meetup-card-meta">
          <span>地点：{meetup.location}</span>
          <span>时间：{meetup.meetup_time}</span>
          <span>人数：{current}/{meetup.max_participants}</span>
        </div>
        {meetup.description && <div className="meetup-card-desc">{meetup.description}</div>}
        <div className="meetup-card-footer">
          <span className="meetup-organizer">发起人：{meetup.user_nickname}</span>
          <div className="meetup-card-actions">
            {canRegister && (
              <button className="btn btn-primary btn-sm" onClick={() => handleRegister(meetup.id)}>
                报名参加
              </button>
            )}
            {canCancelReg && (
              <button className="btn btn-danger btn-sm" onClick={() => handleCancelRegistration(meetup.id)}>
                取消报名
              </button>
            )}
            {showOwnerActions && meetup.user_id === user?.id && (meetup.status === 'open' || meetup.status === 'full') && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => handleViewRegistrations(meetup.id)}>
                  管理报名 ({current}人)
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => handleCloseMeetup(meetup.id)}>
                  关闭报名
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleCancelMeetup(meetup.id)}>
                  取消活动
                </button>
              </>
            )}
            {showOwnerActions && meetup.user_id === user?.id && meetup.status === 'closed' && (
              <button className="btn btn-secondary btn-sm" onClick={() => handleViewRegistrations(meetup.id)}>
                查看报名 ({current}人)
              </button>
            )}
          </div>
        </div>
        <div className="meetup-progress-bar">
          <div
            className="meetup-progress-fill"
            style={{ width: `${Math.min((current / meetup.max_participants) * 100, 100)}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="section-header">
        <h2>宠物聚会</h2>
        {user && (
          <button className="btn btn-primary btn-sm" onClick={() => { setShowPublish(true); setFormError(''); }}>
            + 发起聚会
          </button>
        )}
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'browse' ? 'active' : ''}`} onClick={() => setTab('browse')}>全部活动</button>
        {user && <button className={`tab-btn ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>我发起的</button>}
        {user && <button className={`tab-btn ${tab === 'registered' ? 'active' : ''}`} onClick={() => setTab('registered')}>我报名的</button>}
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : tab === 'browse' ? (
        meetups.length === 0 ? (
          <div className="empty-state"><p>暂无聚会活动</p></div>
        ) : (
          meetups.map(m => renderMeetupCard(m))
        )
      ) : tab === 'mine' ? (
        myMeetups.length === 0 ? (
          <div className="empty-state"><p>暂无发起的活动，点击上方按钮发起聚会</p></div>
        ) : (
          myMeetups.map(m => renderMeetupCard(m, true))
        )
      ) : (
        registeredMeetups.length === 0 ? (
          <div className="empty-state"><p>暂无报名的活动</p></div>
        ) : (
          registeredMeetups.map(m => (
            <div key={m.id} className="meetup-card">
              <div className="meetup-card-header">
                <h3>{m.title}</h3>
                <span className={`tag ${getMeetupStatusTag(m.status).className}`}>
                  {getMeetupStatusTag(m.status).text}
                </span>
              </div>
              <div className="meetup-card-meta">
                <span>地点：{m.location}</span>
                <span>时间：{m.meetup_time}</span>
                <span>人数：{m.current_participants || 0}/{m.max_participants}</span>
              </div>
              {m.description && <div className="meetup-card-desc">{m.description}</div>}
              <div className="meetup-card-footer">
                <span className="meetup-organizer">发起人：{m.user_nickname}</span>
                <div className="meetup-card-actions">
                  {m.my_status === 'registered' && (m.status === 'open' || m.status === 'full') && (
                    <button className="btn btn-danger btn-sm" onClick={() => handleCancelRegistration(m.id)}>
                      取消报名
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )
      )}

      {showPublish && (
        <div className="modal-overlay" onClick={() => setShowPublish(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>发起宠物聚会</h2>
              <button className="modal-close" onClick={() => setShowPublish(false)}>X</button>
            </div>
            <form onSubmit={handlePublish}>
              <div className="form-group">
                <label>活动标题 *</label>
                <input
                  type="text"
                  value={publishForm.title}
                  onChange={e => setPublishForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="例如：周末公园宠物社交聚会"
                />
              </div>
              <div className="form-group">
                <label>活动地点 *</label>
                <input
                  type="text"
                  value={publishForm.location}
                  onChange={e => setPublishForm(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="例如：市中心宠物公园"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>活动时间 *</label>
                  <input
                    type="datetime-local"
                    value={publishForm.meetup_time}
                    onChange={e => setPublishForm(prev => ({ ...prev, meetup_time: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>人数上限 *</label>
                  <input
                    type="number"
                    min={2}
                    max={200}
                    value={publishForm.max_participants}
                    onChange={e => setPublishForm(prev => ({ ...prev, max_participants: parseInt(e.target.value) || 2 }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>活动描述</label>
                <textarea
                  value={publishForm.description}
                  onChange={e => setPublishForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="活动详情、注意事项等"
                />
              </div>
              {formError && <p className="error-msg">{formError}</p>}
              <button type="submit" className="btn btn-primary btn-block" disabled={formLoading}>
                {formLoading ? '提交中...' : '发布活动'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showRegistrations !== null && (
        <div className="modal-overlay" onClick={() => setShowRegistrations(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>报名名单</h2>
              <button className="modal-close" onClick={() => setShowRegistrations(null)}>X</button>
            </div>
            {registrations.filter(r => r.status === 'registered').length === 0 ? (
              <p style={{ textAlign: 'center', color: '#aaa' }}>暂无报名</p>
            ) : (
              <div className="app-list">
                {registrations.filter(r => r.status === 'registered').map(reg => (
                  <div key={reg.id} className="app-item">
                    <div className="app-item-header">
                      <h4>{reg.user_nickname}</h4>
                      <span style={{ fontSize: 13, color: '#888' }}>
                        {formatDate(reg.created_at)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleRemoveRegistration(showRegistrations!, reg.user_id)}
                      >
                        移除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {registrations.filter(r => r.status === 'removed').length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ fontSize: 14, color: '#888', marginBottom: 8 }}>已移除</h4>
                {registrations.filter(r => r.status === 'removed').map(reg => (
                  <div key={reg.id} className="app-item" style={{ opacity: 0.5 }}>
                    <div className="app-item-header">
                      <h4>{reg.user_nickname}</h4>
                      <span style={{ fontSize: 13, color: '#ff4757' }}>已移除</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
