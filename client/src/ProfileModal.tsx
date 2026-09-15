import { useEffect, useState } from 'react';
import { COLOR_SCHEMES, DEFAULT_COLOR_SCHEME } from './colorSchemes';

const API = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const SCHEME_KEYS = Object.keys(COLOR_SCHEMES);

interface CustomField {
  label: string;
  value: string;
}

interface Profile {
  id: string;
  username: string;
  image_url: string | null;
  bio: string | null;
  status: string | null;
  color_scheme: string | null;
  custom_fields: CustomField[];
  messageCount: number;
  messagePercent: number;
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
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [colorScheme, setColorScheme] = useState(DEFAULT_COLOR_SCHEME);
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
        setCustomFields(data.custom_fields ?? []);
        setColorScheme(data.color_scheme && COLOR_SCHEMES[data.color_scheme] ? data.color_scheme : DEFAULT_COLOR_SCHEME);
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
        body: JSON.stringify({
          bio: bio.trim() || null,
          status: status.trim() || null,
          color_scheme: colorScheme,
          custom_fields: customFields.filter((f) => f.label.trim() || f.value.trim()),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setBio(data.bio ?? '');
        setStatus(data.status ?? '');
        setCustomFields(data.custom_fields ?? []);
        setColorScheme(data.color_scheme && COLOR_SCHEMES[data.color_scheme] ? data.color_scheme : DEFAULT_COLOR_SCHEME);
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
      setCustomFields(profile.custom_fields ?? []);
      setColorScheme(profile.color_scheme && COLOR_SCHEMES[profile.color_scheme] ? profile.color_scheme : DEFAULT_COLOR_SCHEME);
    }
    setEditing(false);
  }

  function updateField(i: number, key: keyof CustomField, value: string) {
    setCustomFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, [key]: value } : f)));
  }

  function removeField(i: number) {
    setCustomFields((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addField() {
    setCustomFields((prev) => (prev.length >= 3 ? prev : [...prev, { label: '', value: '' }]));
  }

  const scheme = COLOR_SCHEMES[colorScheme] ?? COLOR_SCHEMES[DEFAULT_COLOR_SCHEME];
  const cardVars = {
    '--title-start': scheme.titleStart,
    '--title-end': scheme.titleEnd,
    '--accent': scheme.accent,
    '--body': scheme.body,
    '--text': scheme.text,
    '--text-muted': scheme.textMuted,
    '--border': scheme.border,
    '--border-light': scheme.borderLight,
  } as React.CSSProperties;

  const visibleFields = editing ? customFields : (profile?.custom_fields ?? []);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div className="xp-window profile-modal-window" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="xp-titlebar" style={{ background: `linear-gradient(to right, ${scheme.titleStart}, ${scheme.titleEnd})` }}>
          <span className="xp-titlebar-text">{profile ? `${profile.username} — profile.exe` : 'Profile'}</span>
          <div className="xp-controls">
            <button className="xp-btn close" onClick={onClose}>✕</button>
          </div>
        </div>

        {!profile ? (
          <div style={{ background: '#d4d0c8', fontFamily: 'Tahoma', fontSize: 11, color: '#333', textAlign: 'center', padding: '24px 0' }}>
            Loading…
          </div>
        ) : (
          <>
            <div className="profile-menubar" style={cardVars}>
              <span>File</span>
              <span>Edit</span>
              <span>View</span>
              <span>Help</span>
            </div>
            <div className="profile-card-body" style={cardVars}>
              <div className="profile-photo-panel">
                {profile.image_url ? (
                  <img src={profile.image_url} alt={profile.username} className="profile-photo" />
                ) : (
                  <div className="profile-photo">👤</div>
                )}

                {editing ? (
                  <input
                    className="xp-input"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    placeholder="a little tagline"
                    maxLength={100}
                    autoFocus
                  />
                ) : status ? (
                  <div className="profile-tagline">{status}</div>
                ) : (
                  <div className="profile-tagline placeholder">no vibe set yet</div>
                )}

                <div className="profile-swatch-strip">
                  {SCHEME_KEYS.map((key) => (
                    <div
                      key={key}
                      className={`profile-swatch-item${editing ? ' selectable' : ''}`}
                      onClick={editing ? () => setColorScheme(key) : undefined}
                    >
                      <div
                        className={`profile-swatch-dot${editing ? ' selectable' : ''}${editing && key === colorScheme ? ' active' : ''}`}
                        style={{ background: COLOR_SCHEMES[key].accent }}
                        title={COLOR_SCHEMES[key].name}
                      />
                      <span className="profile-swatch-hex">{COLOR_SCHEMES[key].accent.slice(1).toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="profile-content">
                <div className="profile-name">{profile.username}</div>

                <div className="profile-stats">
                  <div className="profile-stat-row">
                    <span className="profile-stat-label">msgs</span>
                    <span className="profile-stat-value">
                      {profile.messageCount.toLocaleString()} · {profile.messagePercent}% of all messages
                    </span>
                  </div>
                  {!editing && visibleFields.map((f, i) => (
                    <div className="profile-stat-row" key={i}>
                      <span className="profile-stat-label">{f.label}</span>
                      <span className="profile-stat-value">{f.value}</span>
                    </div>
                  ))}
                </div>

                {editing && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {customFields.map((f, i) => (
                      <div className="profile-field-row" key={i}>
                        <input
                          className="xp-input"
                          style={{ width: 90 }}
                          value={f.label}
                          onChange={(e) => updateField(i, 'label', e.target.value)}
                          placeholder="label"
                          maxLength={30}
                        />
                        <input
                          className="xp-input"
                          value={f.value}
                          onChange={(e) => updateField(i, 'value', e.target.value)}
                          placeholder="value"
                          maxLength={60}
                        />
                        <button className="profile-field-remove" onClick={() => removeField(i)}>✕</button>
                      </div>
                    ))}
                    {customFields.length < 3 && (
                      <button className="xp-button" style={{ alignSelf: 'flex-start' }} onClick={addField}>
                        + Add field
                      </button>
                    )}
                  </div>
                )}

                {editing ? (
                  <textarea
                    style={{
                      width: '100%', fontFamily: 'Tahoma', fontSize: 11,
                      border: '2px solid', borderColor: '#808080 #fff #fff #808080',
                      padding: '4px 6px', resize: 'vertical', minHeight: 50, color: '#000',
                      background: '#fff',
                    }}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="tell us about yourself…"
                    maxLength={300}
                  />
                ) : profile.bio ? (
                  <>
                    <div className="profile-divider" />
                    <div className="profile-bio">{profile.bio}</div>
                  </>
                ) : null}
              </div>
            </div>

            <div style={{ background: '#d4d0c8', padding: '8px 16px 14px', display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              {editing ? (
                <>
                  <button className="xp-button" onClick={handleCancel} disabled={saving}>Cancel</button>
                  <button className="xp-button" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </>
              ) : (
                !readOnly && (
                  <button className="xp-button" onClick={() => setEditing(true)}>Edit Profile</button>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
