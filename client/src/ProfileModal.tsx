import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Profile {
  id: string;
  username: string;
  image_url: string | null;
  bio: string | null;
  status: string | null;
}

interface Props {
  onClose: () => void;
  getToken: () => Promise<string | null>;
  userId?: string;
}

export default function ProfileModal({ onClose, getToken, userId }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const readOnly = !!userId;

  useEffect(() => {
    async function load() {
      const token = await getToken();
      const url = userId ? `${API}/api/users/${userId}` : `${API}/api/me`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setBio(data.bio ?? '');
        setStatus(data.status ?? '');
      }
    }
    load();
  }, [userId]);

  async function handleSave() {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bio: bio.trim() || null, status: status.trim() || null }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setBio(data.bio ?? '');
        setStatus(data.status ?? '');
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (profile) {
      setBio(profile.bio ?? '');
      setStatus(profile.status ?? '');
    }
    setEditing(false);
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div className="xp-window" style={{ width: 320 }} onClick={(e) => e.stopPropagation()}>
        <div className="xp-titlebar">
          <span className="xp-titlebar-text">{readOnly && profile ? `${profile.username}'s Profile` : 'My Profile'}</span>
          <div className="xp-controls">
            <button className="xp-btn close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={{ background: '#d4d0c8', padding: 16 }}>
          {!profile ? (
            <div style={{ fontFamily: 'Tahoma', fontSize: 11, color: '#333', textAlign: 'center', padding: '12px 0' }}>
              Loading…
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {profile.image_url ? (
                  <img
                    src={profile.image_url}
                    alt={profile.username}
                    style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid #808080', objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid #808080', background: '#a6caf0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                    👤
                  </div>
                )}
                <div style={{ fontFamily: 'Tahoma', fontSize: 13, fontWeight: 'bold', color: '#000' }}>
                  {profile.username}
                </div>
              </div>

              {editing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <label style={{ fontFamily: 'Tahoma', fontSize: 10, color: '#333', display: 'block', marginBottom: 2 }}>Status</label>
                    <input
                      className="xp-input"
                      style={{ width: '100%' }}
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      placeholder="What's on your mind?"
                      maxLength={100}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label style={{ fontFamily: 'Tahoma', fontSize: 10, color: '#333', display: 'block', marginBottom: 2 }}>Bio</label>
                    <textarea
                      style={{
                        width: '100%', fontFamily: 'Tahoma', fontSize: 11,
                        border: '2px solid', borderColor: '#808080 #fff #fff #808080',
                        padding: '2px 4px', resize: 'vertical', minHeight: 60, color: '#000',
                        background: '#fff',
                      }}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Tell us about yourself…"
                      maxLength={300}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="xp-button" onClick={handleCancel} disabled={saving}>Cancel</button>
                    <button className="xp-button" onClick={handleSave} disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{
                    border: '2px solid', borderColor: '#808080 #fff #fff #808080',
                    background: '#fff', padding: '6px 8px', minHeight: 60,
                  }}>
                    {profile.status && (
                      <div style={{ fontFamily: 'Tahoma', fontSize: 11, color: '#0a246a', marginBottom: 4 }}>
                        💬 {profile.status}
                      </div>
                    )}
                    {profile.bio ? (
                      <div style={{ fontFamily: 'Tahoma', fontSize: 11, color: '#333', whiteSpace: 'pre-wrap' }}>
                        {profile.bio}
                      </div>
                    ) : (
                      <div style={{ fontFamily: 'Tahoma', fontSize: 11, color: '#999', fontStyle: 'italic' }}>
                        No bio yet.
                      </div>
                    )}
                  </div>
                  {!readOnly && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="xp-button" onClick={() => setEditing(true)}>Edit Profile</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
