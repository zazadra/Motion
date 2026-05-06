'use client';
import { useState, useEffect } from 'react';
import { getAdmins, addAdmin, removeAdmin, INITIAL_ADMINS } from '@/lib/fields';

export function AdminsTab() {
  const [admins, setAdmins]   = useState<string[]>([]);
  const [newAddr, setNewAddr] = useState('');
  const [err, setErr]         = useState('');

  function refresh() { setAdmins(getAdmins()); }
  useEffect(() => { refresh(); }, []);

  function handleAdd() {
    const addr = newAddr.trim();
    if (!addr.startsWith('0x') || addr.length < 10) { setErr('Invalid address'); return; }
    addAdmin(addr);
    setNewAddr(''); setErr('');
    refresh();
  }

  function handleRemove(addr: string) {
    if (INITIAL_ADMINS.includes(addr)) { setErr('Cannot remove initial admins.'); return; }
    removeAdmin(addr);
    refresh();
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>
      <div className="card" style={{ padding:'20px' }}>
        <p style={{ fontSize:'11px', fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:'14px' }}>Admin Addresses</p>
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {admins.map(addr => (
            <div key={addr} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', borderRadius:'10px', background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'#4ade80', flexShrink:0 }}/>
              <span style={{ flex:1, fontFamily:'var(--mono)', fontSize:'12px', color:'var(--text-2)', overflow:'hidden', textOverflow:'ellipsis' }}>{addr}</span>
              {INITIAL_ADMINS.includes(addr)
                ? <span style={{ fontSize:'10px', color:'var(--text-3)', fontWeight:600 }}>INITIAL</span>
                : <button className="btn btn-ghost btn-sm" style={{ color:'#f87171', fontSize:'12px' }} onClick={()=>handleRemove(addr)}>Remove</button>
              }
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding:'20px', display:'flex', flexDirection:'column', gap:'10px' }}>
        <p style={{ fontSize:'11px', fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-3)' }}>Add Admin</p>
        <input className="input" placeholder="0x..." value={newAddr} onChange={e=>{ setNewAddr(e.target.value); setErr(''); }}
          onKeyDown={e=>e.key==='Enter'&&handleAdd()} style={{ fontFamily:'var(--mono)', fontSize:'13px' }} />
        {err && <p style={{ fontSize:'12px', color:'#f87171' }}>{err}</p>}
        <button className="btn btn-primary" onClick={handleAdd}>Add Admin</button>
      </div>
    </div>
  );
}
