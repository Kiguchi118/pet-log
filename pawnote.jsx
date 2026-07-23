import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Utensils, Droplets, Scale, HeartPulse, Stethoscope, Pill, Scissors,
  Camera, PawPrint, Settings, X, Plus,
  Copy, Check, LogOut, Loader2, ImagePlus
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

/* ------------------------------------------------------------------
   THEME — "野帳" (field logbook) direction: kraft-paper warmth,
   moss + mustard ink, monospace stamps for timestamps.
------------------------------------------------------------------- */
const theme = {
  paper: "#F2ECDC",      // kraft paper
  paperDeep: "#E7DFC7",  // recessed panels
  ink: "#2E2B22",        // near-black warm ink
  inkSoft: "#635C4A",    // secondary text
  moss: "#516B4E",       // primary accent
  mossDeep: "#3C5039",
  mustard: "#C9982F",    // secondary accent
  slate: "#4B6672",      // water / cool accent
  rust: "#B2472F",       // alerts only
  line: "#D8CEAE",       // hairlines
  cream: "#FBF8F0",
};

const FONT_IMPORT_ID = "pawnote-fonts";
function ensureFonts() {
  if (document.getElementById(FONT_IMPORT_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_IMPORT_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans+JP:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap";
  document.head.appendChild(link);
}

const F_DISPLAY = "'Fraunces', serif";
const F_BODY = "'IBM Plex Sans JP', sans-serif";
const F_MONO = "'IBM Plex Mono', monospace";

/* ------------------------------------------------------------------
   STORAGE HELPERS
------------------------------------------------------------------- */
async function getVal(key, shared) {
  try {
    const r = await window.storage.get(key, shared);
    return r ? JSON.parse(r.value) : null;
  } catch (e) {
    return null;
  }
}
async function setVal(key, value, shared) {
  try {
    await window.storage.set(key, JSON.stringify(value), shared);
    return true;
  } catch (e) {
    return false;
  }
}

function sanitizeCode(raw) {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\/\\'"]/g, "")
    .slice(0, 60);
}

function monthKey(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}
function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function fmtDateHeading(iso) {
  const d = new Date(iso);
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getMonth() + 1}月${d.getDate()}日(${days[d.getDay()]})`;
}
function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ------------------------------------------------------------------
   IMAGE RESIZE (client-side, before storage)
------------------------------------------------------------------- */
function resizeImageFile(file, maxWidth = 720, quality = 0.55) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image decode failed"));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------
   CATEGORY DEFINITIONS
------------------------------------------------------------------- */
const CATEGORIES = [
  { key: "food", label: "ごはん", icon: Utensils, color: theme.moss },
  { key: "water", label: "お水", icon: Droplets, color: theme.slate },
  { key: "toilet", label: "トイレ", emoji: "🚽", color: theme.mustard },
  { key: "weight", label: "体重", icon: Scale, color: theme.mossDeep },
  { key: "health", label: "健康チェック", icon: HeartPulse, color: theme.rust },
  { key: "hospital", label: "通院", icon: Stethoscope, color: theme.slate },
  { key: "medication", label: "投薬", icon: Pill, color: theme.mustard },
  { key: "trimming", label: "トリミング", icon: Scissors, color: theme.moss },
];
const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

function CatIcon({ cat, size = 18, color }) {
  if (cat.emoji) return <span style={{ fontSize: size }}>{cat.emoji}</span>;
  const Ico = cat.icon;
  return <Ico size={size} color={color || cat.color} strokeWidth={2} />;
}

function summarizeRecord(r) {
  switch (r.type) {
    case "food":
      return [r.amount, r.memo].filter(Boolean).join(" ・ ") || "ごはんを記録";
    case "water":
      return [r.amount, r.memo].filter(Boolean).join(" ・ ") || "お水を記録";
    case "toilet": {
      const kind = r.kind === "poop" ? "うんち" : "おしっこ";
      const status = r.status === "bad" ? "（気になる様子）" : r.status === "good" ? "（順調）" : "";
      return [kind + status, r.memo].filter(Boolean).join(" ・ ");
    }
    case "weight":
      return [`${r.value} kg`, r.memo].filter(Boolean).join(" ・ ");
    case "health":
      return [r.condition, r.memo].filter(Boolean).join(" ・ ");
    case "hospital":
      return [r.reason, r.cost ? `¥${r.cost}` : "", r.nextVisit ? `次回 ${r.nextVisit}` : "", r.memo]
        .filter(Boolean)
        .join(" ・ ");
    case "medication":
      return [r.name, r.memo].filter(Boolean).join(" ・ ");
    case "trimming":
      return [r.shop, r.staff, r.nextDate ? `次回 ${r.nextDate}` : "", r.memo].filter(Boolean).join(" ・ ");
    default:
      return r.memo || "";
  }
}

/* ------------------------------------------------------------------
   SMALL UI PRIMITIVES
------------------------------------------------------------------- */
function Panel({ children, style, ...rest }) {
  return (
    <div
      style={{ background: theme.cream, border: `1px solid ${theme.line}`, borderRadius: 14, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick, style, disabled, type = "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: theme.moss,
        color: theme.cream,
        fontFamily: F_BODY,
        fontWeight: 600,
        border: "none",
        borderRadius: 10,
        padding: "11px 18px",
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "default" : "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function TextField({ label, ...props }) {
  return (
    <label className="block" style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: F_BODY, fontSize: 12.5, color: theme.inkSoft, marginBottom: 4 }}>{label}</div>
      <input
        {...props}
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: theme.paper,
          border: `1px solid ${theme.line}`,
          borderRadius: 8,
          padding: "9px 10px",
          fontFamily: F_BODY,
          fontSize: 14.5,
          color: theme.ink,
          ...props.style,
        }}
      />
    </label>
  );
}

function TextArea({ label, ...props }) {
  return (
    <label className="block" style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: F_BODY, fontSize: 12.5, color: theme.inkSoft, marginBottom: 4 }}>{label}</div>
      <textarea
        {...props}
        rows={props.rows || 2}
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: theme.paper,
          border: `1px solid ${theme.line}`,
          borderRadius: 8,
          padding: "9px 10px",
          fontFamily: F_BODY,
          fontSize: 14.5,
          color: theme.ink,
          resize: "vertical",
          ...props.style,
        }}
      />
    </label>
  );
}

function ChoiceRow({ label, options, value, onChange }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: F_BODY, fontSize: 12.5, color: theme.inkSoft, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              style={{
                fontFamily: F_BODY,
                fontSize: 13.5,
                padding: "7px 13px",
                borderRadius: 999,
                border: `1.5px solid ${active ? theme.moss : theme.line}`,
                background: active ? theme.moss : theme.paper,
                color: active ? theme.cream : theme.ink,
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(46,43,34,0.45)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.cream, width: "100%", maxWidth: 480,
          borderRadius: "18px 18px 0 0", padding: "18px 18px 26px",
          maxHeight: "88vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: F_DISPLAY, fontWeight: 600, fontSize: 19, color: theme.ink }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={20} color={theme.inkSoft} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   ONBOARDING
------------------------------------------------------------------- */
function Onboarding({ onDone }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    if (!name.trim()) { setErr("お名前を入力してください"); return; }
    const gc = sanitizeCode(code);
    if (!gc) { setErr("合言葉を入力してください"); return; }
    setBusy(true);
    await setVal("profile", { name: name.trim(), groupCode: gc }, false);
    setBusy(false);
    onDone({ name: name.trim(), groupCode: gc });
  };

  return (
    <div style={{ minHeight: "100vh", background: theme.paper, display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <PawPrint size={26} color={theme.moss} />
        <span style={{ fontFamily: F_DISPLAY, fontWeight: 700, fontSize: 28, color: theme.ink }}>ぶくろく</span>
      </div>
      <div style={{ fontFamily: F_BODY, fontSize: 13, color: theme.inkSoft, marginBottom: 30, textAlign: "center" }}>
        家族だけの、ペットのお世話ノート。<br />記録は消えません。
      </div>

      <Panel style={{ width: "100%", maxWidth: 400, padding: 22 }}>
        <TextField label="お名前（家族に表示されます）" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：まお" />
        <TextField label="家族の合言葉" value={code} onChange={(e) => setCode(e.target.value)} placeholder="例：もふもふ家2026" />
        <div style={{ fontFamily: F_BODY, fontSize: 12, color: theme.inkSoft, marginBottom: 16, lineHeight: 1.6 }}>
          はじめての合言葉なら新しくノートが作られます。家族と同じ合言葉を入れれば、同じ記録を見られます。合言葉は家族以外に教えないでください。
        </div>
        {err && <div style={{ color: theme.rust, fontSize: 13, marginBottom: 10, fontFamily: F_BODY }}>{err}</div>}
        <PrimaryButton onClick={submit} disabled={busy} style={{ width: "100%" }}>
          {busy ? "確認中…" : "はじめる"}
        </PrimaryButton>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------
   PET SETUP (first time for a group code)
------------------------------------------------------------------- */
function PetSetup({ groupCode, onDone }) {
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("dog");
  const [breed, setBreed] = useState("");
  const [birthday, setBirthday] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const pet = { name: name.trim(), species, breed: breed.trim(), birthday, createdAt: new Date().toISOString() };
    await setVal(`pet:${groupCode}`, pet, true);
    setBusy(false);
    onDone(pet);
  };

  return (
    <div style={{ minHeight: "100vh", background: theme.paper, display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 20px" }}>
      <div style={{ fontFamily: F_DISPLAY, fontWeight: 600, fontSize: 22, color: theme.ink, marginBottom: 4 }}>この子のことを教えて</div>
      <div style={{ fontFamily: F_BODY, fontSize: 12.5, color: theme.inkSoft, marginBottom: 22 }}>あとから設定タブでいつでも変更できます</div>
      <Panel style={{ width: "100%", maxWidth: 400, padding: 22 }}>
        <TextField label="名前" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：もふ" />
        <ChoiceRow
          label="種類"
          value={species}
          onChange={setSpecies}
          options={[{ value: "dog", label: "🐶 犬" }, { value: "cat", label: "🐱 猫" }, { value: "other", label: "🐾 その他" }]}
        />
        <TextField label="犬種・猫種（任意）" value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="例：トイプードル" />
        <TextField label="お誕生日（任意）" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
        <PrimaryButton onClick={submit} disabled={busy || !name.trim()} style={{ width: "100%", marginTop: 4 }}>
          {busy ? "保存中…" : "はじめる"}
        </PrimaryButton>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------
   RECORD FORM (generic, per category)
------------------------------------------------------------------- */
function RecordForm({ catKey, groupCode, author, onSaved, onClose }) {
  const cat = CAT_BY_KEY[catKey];
  const [datetime, setDatetime] = useState(nowLocalInput());
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("ふつう");
  const [kind, setKind] = useState("pee");
  const [status, setStatus] = useState("");
  const [value, setValue] = useState("");
  const [condition, setCondition] = useState("元気");
  const [reason, setReason] = useState("");
  const [cost, setCost] = useState("");
  const [nextVisit, setNextVisit] = useState("");
  const [name, setName] = useState("");
  const [shop, setShop] = useState("");
  const [staff, setStaff] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const buildRecord = () => {
    const base = { id: uid(), type: catKey, datetime: new Date(datetime).toISOString(), memo: memo.trim(), author, createdAt: new Date().toISOString() };
    switch (catKey) {
      case "food": return { ...base, amount };
      case "water": return { ...base, amount };
      case "toilet": return { ...base, kind, status };
      case "weight": return { ...base, value: parseFloat(value) };
      case "health": return { ...base, condition };
      case "hospital": return { ...base, reason: reason.trim(), cost: cost ? Number(cost) : null, nextVisit };
      case "medication": return { ...base, name: name.trim() };
      case "trimming": return { ...base, shop: shop.trim(), staff: staff.trim(), nextDate };
      default: return base;
    }
  };

  const canSave = catKey !== "weight" || (value !== "" && !isNaN(parseFloat(value)));

  const save = async () => {
    setSaving(true);
    setError("");
    const rec = buildRecord();
    const mk = monthKey(rec.datetime);

    const monthsIdx = (await getVal(`months:${groupCode}`, true)) || [];
    if (!monthsIdx.includes(mk)) {
      monthsIdx.push(mk);
      monthsIdx.sort();
      await setVal(`months:${groupCode}`, monthsIdx, true);
    }
    const monthRecs = (await getVal(`records:${groupCode}:${mk}`, true)) || [];
    monthRecs.push(rec);
    const ok = await setVal(`records:${groupCode}:${mk}`, monthRecs, true);
    if (!ok) {
      setSaving(false);
      setError("保存できませんでした。通信状況を確認してもう一度お試しください。");
      return;
    }

    if (catKey === "weight" && !isNaN(rec.value)) {
      const wl = (await getVal(`weightlog:${groupCode}`, true)) || [];
      wl.push({ date: rec.datetime, value: rec.value });
      wl.sort((a, b) => new Date(a.date) - new Date(b.date));
      await setVal(`weightlog:${groupCode}`, wl, true);
    }

    if ((catKey === "hospital" && rec.nextVisit) || (catKey === "trimming" && rec.nextDate)) {
      const upcoming = (await getVal(`upcoming:${groupCode}`, true)) || [];
      const dateVal = catKey === "hospital" ? rec.nextVisit : rec.nextDate;
      const label = catKey === "hospital" ? "通院" : "トリミング";
      const filtered = upcoming.filter((u) => u.type !== catKey);
      filtered.push({ type: catKey, label, date: dateVal, memo: rec.memo });
      await setVal(`upcoming:${groupCode}`, filtered, true);
    }

    setSaving(false);
    onSaved(rec);
  };

  return (
    <Modal title={`${cat.label}を記録`} onClose={onClose}>
      <TextField label="日時" type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} />

      {catKey === "food" && (
        <ChoiceRow label="量" value={amount} onChange={setAmount} options={["少なめ", "ふつう", "多め", "残した"].map((v) => ({ value: v, label: v }))} />
      )}
      {catKey === "water" && (
        <ChoiceRow label="量の目安" value={amount} onChange={setAmount} options={["少なめ", "ふつう", "多め"].map((v) => ({ value: v, label: v }))} />
      )}
      {catKey === "toilet" && (
        <>
          <ChoiceRow label="種類" value={kind} onChange={setKind} options={[{ value: "pee", label: "💧 おしっこ" }, { value: "poop", label: "💩 うんち" }]} />
          <ChoiceRow label="様子（任意）" value={status} onChange={setStatus} options={[{ value: "", label: "特になし" }, { value: "good", label: "順調" }, { value: "bad", label: "気になる" }]} />
        </>
      )}
      {catKey === "weight" && (
        <TextField label="体重（kg）" type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder="例：4.20" />
      )}
      {catKey === "health" && (
        <ChoiceRow label="今日の様子" value={condition} onChange={setCondition} options={["元気", "普通", "不調"].map((v) => ({ value: v, label: v }))} />
      )}
      {catKey === "hospital" && (
        <>
          <TextField label="内容・理由" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：定期健診" />
          <TextField label="費用（円・任意）" type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
          <TextField label="次回の予定（任意）" type="date" value={nextVisit} onChange={(e) => setNextVisit(e.target.value)} />
        </>
      )}
      {catKey === "medication" && (
        <TextField label="薬の名前" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：フィラリア予防薬" />
      )}
      {catKey === "trimming" && (
        <>
          <TextField label="お店（任意）" value={shop} onChange={(e) => setShop(e.target.value)} />
          <TextField label="担当者（任意）" value={staff} onChange={(e) => setStaff(e.target.value)} />
          <TextField label="次回の予定（任意）" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
        </>
      )}

      <TextArea label="メモ（任意）" value={memo} onChange={(e) => setMemo(e.target.value)} />

      {catKey === "health" && (
        <div style={{ fontFamily: F_BODY, fontSize: 11.5, color: theme.inkSoft, marginBottom: 10, lineHeight: 1.6 }}>
          ※ここでの記録は診断ではありません。気になる様子があるときは動物病院にご相談ください。
        </div>
      )}

      {error && <div style={{ color: theme.rust, fontSize: 12.5, marginBottom: 10, fontFamily: F_BODY }}>{error}</div>}
      <PrimaryButton onClick={save} disabled={saving || !canSave} style={{ width: "100%", marginTop: 4 }}>
        {saving ? "保存中…" : "記録する"}
      </PrimaryButton>
    </Modal>
  );
}

/* ------------------------------------------------------------------
   DIARY ADD FORM
------------------------------------------------------------------- */
function DiaryForm({ groupCode, author, onSaved, onClose }) {
  const [date, setDate] = useState(nowLocalInput().slice(0, 10));
  const [caption, setCaption] = useState("");
  const [mood, setMood] = useState("元気");
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    try {
      const dataUrl = await resizeImageFile(file);
      setPhoto(dataUrl);
    } catch (err) {
      // ignore, allow caption-only entry
    }
    setProcessing(false);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    const entry = { id: uid(), date: new Date(date).toISOString(), caption: caption.trim(), mood, photo, author, createdAt: new Date().toISOString() };
    const mk = monthKey(entry.date);

    const monthsIdx = (await getVal(`months:${groupCode}`, true)) || [];
    if (!monthsIdx.includes(mk)) {
      monthsIdx.push(mk);
      monthsIdx.sort();
      await setVal(`months:${groupCode}`, monthsIdx, true);
    }
    const monthDiary = (await getVal(`diary:${groupCode}:${mk}`, true)) || [];
    monthDiary.push(entry);
    const ok = await setVal(`diary:${groupCode}:${mk}`, monthDiary, true);
    if (!ok) {
      setSaving(false);
      setError("保存できませんでした。写真が大きすぎる場合は、別の写真でお試しください。");
      return;
    }

    setSaving(false);
    onSaved(entry);
  };

  return (
    <Modal title="今日の一枚" onClose={onClose}>
      <TextField label="日付" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: F_BODY, fontSize: 12.5, color: theme.inkSoft, marginBottom: 4 }}>写真（任意）</div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", height: photo ? "auto" : 110, borderRadius: 10,
            border: `1.5px dashed ${theme.line}`, background: theme.paper, cursor: "pointer", overflow: "hidden",
          }}
        >
          {processing ? (
            <Loader2 className="animate-spin" size={22} color={theme.inkSoft} />
          ) : photo ? (
            <img src={photo} alt="" style={{ width: "100%", display: "block", borderRadius: 8 }} />
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: theme.inkSoft, fontFamily: F_BODY, fontSize: 13.5 }}>
              <ImagePlus size={18} /> 写真を選ぶ
            </span>
          )}
        </button>
      </div>
      <ChoiceRow label="今日の様子" value={mood} onChange={setMood} options={["元気", "普通", "不調"].map((v) => ({ value: v, label: v }))} />
      <TextArea label="一言（任意）" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="今日はお散歩でリスを追いかけました" />
      {error && <div style={{ color: theme.rust, fontSize: 12.5, marginBottom: 10, fontFamily: F_BODY }}>{error}</div>}
      <PrimaryButton onClick={save} disabled={saving} style={{ width: "100%", marginTop: 4 }}>
        {saving ? "保存中…" : "残す"}
      </PrimaryButton>
    </Modal>
  );
}

/* ------------------------------------------------------------------
   TIMELINE TAB
------------------------------------------------------------------- */
function Timeline({ groupCode, author, pet, refreshFlag }) {
  const [months, setMonths] = useState([]);
  const [loadedCount, setLoadedCount] = useState(3);
  const [recordsByMonth, setRecordsByMonth] = useState({});
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openCat, setOpenCat] = useState(null);

  const loadIndexAndUpcoming = useCallback(async () => {
    const idx = (await getVal(`months:${groupCode}`, true)) || [];
    idx.sort();
    setMonths(idx);
    const up = (await getVal(`upcoming:${groupCode}`, true)) || [];
    setUpcoming(up);
    return idx;
  }, [groupCode]);

  const loadMonths = useCallback(async (monthsToLoad) => {
    const entries = await Promise.all(
      monthsToLoad.map(async (mk) => [mk, (await getVal(`records:${groupCode}:${mk}`, true)) || []])
    );
    setRecordsByMonth((prev) => {
      const next = { ...prev };
      entries.forEach(([mk, recs]) => { next[mk] = recs; });
      return next;
    });
  }, [groupCode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const idx = await loadIndexAndUpcoming();
      const recent = idx.slice(-3).reverse();
      if (!cancelled) await loadMonths(recent);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [groupCode, refreshFlag, loadIndexAndUpcoming, loadMonths]);

  const loadMore = async () => {
    const remaining = [...months].reverse().slice(loadedCount, loadedCount + 3);
    if (remaining.length === 0) return;
    await loadMonths(remaining);
    setLoadedCount((c) => c + 3);
  };

  const visibleMonths = [...months].reverse().slice(0, loadedCount);
  const allRecords = visibleMonths.flatMap((mk) => recordsByMonth[mk] || []);
  allRecords.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

  const grouped = useMemo(() => {
    const g = {};
    allRecords.forEach((r) => {
      const day = r.datetime.slice(0, 10);
      if (!g[day]) g[day] = [];
      g[day].push(r);
    });
    return Object.entries(g).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [allRecords]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayRecs = allRecords.filter((r) => r.datetime.slice(0, 10) === todayStr);
  const todayCounts = { food: 0, water: 0, toilet: 0 };
  todayRecs.forEach((r) => { if (todayCounts[r.type] !== undefined) todayCounts[r.type]++; });

  const upcomingSoon = upcoming.filter((u) => {
    const d = new Date(u.date);
    const diff = (d - new Date()) / 86400000;
    return diff <= 14;
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <div style={{ padding: "14px 14px 90px" }}>
      {/* pet header card */}
      <Panel style={{ padding: "16px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 54, height: 54, borderRadius: "50%", background: theme.paperDeep,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0,
        }}>
          {pet.species === "dog" ? "🐶" : pet.species === "cat" ? "🐱" : "🐾"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: F_DISPLAY, fontWeight: 600, fontSize: 18, color: theme.ink }}>{pet.name}</div>
          <div style={{ fontFamily: F_MONO, fontSize: 12, color: theme.inkSoft }}>
            {pet.breed || (pet.species === "dog" ? "犬" : pet.species === "cat" ? "猫" : "")}
            {pet.birthday ? ` ・ ${ageLabel(pet.birthday)}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, fontFamily: F_MONO, fontSize: 11, color: theme.inkSoft, textAlign: "center" }}>
          <div><div style={{ fontSize: 15, color: theme.ink }}>{todayCounts.food}</div>ごはん</div>
          <div><div style={{ fontSize: 15, color: theme.ink }}>{todayCounts.water}</div>お水</div>
          <div><div style={{ fontSize: 15, color: theme.ink }}>{todayCounts.toilet}</div>トイレ</div>
        </div>
      </Panel>

      {upcomingSoon.length > 0 && (
        <Panel style={{ padding: "12px 14px", marginBottom: 14, borderColor: theme.mustard }}>
          <div style={{ fontFamily: F_BODY, fontWeight: 600, fontSize: 13, color: theme.ink, marginBottom: 6 }}>次回の予定</div>
          {upcomingSoon.map((u, i) => (
            <div key={i} style={{ fontFamily: F_BODY, fontSize: 13, color: theme.inkSoft, display: "flex", justifyContent: "space-between" }}>
              <span>{u.label}{u.memo ? `・${u.memo}` : ""}</span>
              <span style={{ fontFamily: F_MONO, color: new Date(u.date) < new Date() ? theme.rust : theme.ink }}>{u.date}</span>
            </div>
          ))}
        </Panel>
      )}

      {/* quick add grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 9, marginBottom: 18 }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setOpenCat(cat.key)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              padding: "12px 4px", borderRadius: 12, border: `1px solid ${theme.line}`,
              background: theme.cream, cursor: "pointer",
            }}
          >
            <CatIcon cat={cat} size={20} />
            <span style={{ fontFamily: F_BODY, fontSize: 11, color: theme.ink }}>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* timeline feed */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 30, color: theme.inkSoft }}>
          <Loader2 className="animate-spin" size={22} style={{ margin: "0 auto" }} />
        </div>
      ) : grouped.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: theme.inkSoft, fontFamily: F_BODY, fontSize: 13.5 }}>
          まだ記録がありません。<br />上のボタンから最初の記録をつけてみましょう。
        </div>
      ) : (
        grouped.map(([day, recs]) => (
          <div key={day} style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: F_MONO, fontSize: 12, color: theme.inkSoft, marginBottom: 6, letterSpacing: 0.5 }}>
              {fmtDateHeading(day)}
            </div>
            <Panel style={{ overflow: "hidden" }}>
              {recs.map((r, i) => {
                const cat = CAT_BY_KEY[r.type];
                return (
                  <div
                    key={r.id}
                    style={{
                      display: "flex", gap: 10, padding: "10px 12px",
                      borderTop: i === 0 ? "none" : `1px solid ${theme.line}`, alignItems: "flex-start",
                    }}
                  >
                    <div style={{ fontFamily: F_MONO, fontSize: 12.5, color: theme.inkSoft, minWidth: 40, paddingTop: 2 }}>
                      {fmtTime(r.datetime)}
                    </div>
                    <div style={{ paddingTop: 1 }}><CatIcon cat={cat} size={17} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: F_BODY, fontSize: 13.5, color: theme.ink, lineHeight: 1.4 }}>
                        {summarizeRecord(r)}
                      </div>
                      <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: theme.inkSoft, marginTop: 2 }}>{r.author}</div>
                    </div>
                  </div>
                );
              })}
            </Panel>
          </div>
        ))
      )}

      {loadedCount < months.length && (
        <button
          onClick={loadMore}
          style={{
            width: "100%", padding: "11px", borderRadius: 10, border: `1px solid ${theme.line}`,
            background: "transparent", color: theme.inkSoft, fontFamily: F_BODY, fontSize: 13, cursor: "pointer",
          }}
        >
          もっと読み込む
        </button>
      )}

      {openCat && (
        <RecordForm
          catKey={openCat}
          groupCode={groupCode}
          author={author}
          onClose={() => setOpenCat(null)}
          onSaved={() => { setOpenCat(null); loadIndexAndUpcoming().then((idx) => loadMonths([...idx].reverse().slice(0, loadedCount))); }}
        />
      )}
    </div>
  );
}

function ageLabel(birthday) {
  const b = new Date(birthday);
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  let months = now.getMonth() - b.getMonth();
  if (now.getDate() < b.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  if (years <= 0) return `生後${months}ヶ月`;
  return `${years}歳${months}ヶ月`;
}

/* ------------------------------------------------------------------
   WEIGHT TAB
------------------------------------------------------------------- */
function WeightTab({ groupCode, author, refreshFlag }) {
  const [log, setLog] = useState(null);
  const [openForm, setOpenForm] = useState(false);

  const load = useCallback(async () => {
    const wl = (await getVal(`weightlog:${groupCode}`, true)) || [];
    setLog(wl);
  }, [groupCode]);

  useEffect(() => { load(); }, [load, refreshFlag]);

  const chartData = (log || []).map((p) => ({
    label: new Date(p.date).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }),
    kg: p.value,
  }));

  const latest = log && log.length ? log[log.length - 1] : null;
  const prev = log && log.length > 1 ? log[log.length - 2] : null;
  const diff = latest && prev ? (latest.value - prev.value).toFixed(2) : null;

  return (
    <div style={{ padding: "14px 14px 90px" }}>
      <Panel style={{ padding: 16, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: F_BODY, fontSize: 12, color: theme.inkSoft }}>最新の体重</div>
          <div style={{ fontFamily: F_MONO, fontSize: 26, color: theme.ink, fontWeight: 500 }}>
            {latest ? `${latest.value} kg` : "—"}
          </div>
          {diff !== null && (
            <div style={{ fontFamily: F_MONO, fontSize: 12.5, color: diff > 0 ? theme.rust : diff < 0 ? theme.slate : theme.inkSoft }}>
              前回から {diff > 0 ? "+" : ""}{diff} kg
            </div>
          )}
        </div>
        <PrimaryButton onClick={() => setOpenForm(true)}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Plus size={16} /> 記録</span>
        </PrimaryButton>
      </Panel>

      <Panel style={{ padding: "16px 8px 8px" }}>
        {log === null ? (
          <div style={{ textAlign: "center", padding: 30 }}><Loader2 className="animate-spin" size={20} color={theme.inkSoft} /></div>
        ) : chartData.length < 2 ? (
          <div style={{ textAlign: "center", padding: "24px 12px", color: theme.inkSoft, fontFamily: F_BODY, fontSize: 13 }}>
            体重の記録が2件以上になるとグラフが表示されます。
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={theme.line} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: F_MONO, fill: theme.inkSoft }} axisLine={{ stroke: theme.line }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fontFamily: F_MONO, fill: theme.inkSoft }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ fontFamily: F_BODY, fontSize: 12, borderRadius: 8, border: `1px solid ${theme.line}` }} />
              <Line type="monotone" dataKey="kg" stroke={theme.moss} strokeWidth={2.5} dot={{ r: 3, fill: theme.moss }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Panel>

      {openForm && (
        <RecordForm
          catKey="weight"
          groupCode={groupCode}
          author={author}
          onClose={() => setOpenForm(false)}
          onSaved={() => { setOpenForm(false); load(); }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   DIARY TAB
------------------------------------------------------------------- */
function DiaryTab({ groupCode, author, refreshFlag }) {
  const [months, setMonths] = useState([]);
  const [loadedCount, setLoadedCount] = useState(6);
  const [diaryByMonth, setDiaryByMonth] = useState({});
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [viewing, setViewing] = useState(null);

  const loadIdx = useCallback(async () => {
    const idx = (await getVal(`months:${groupCode}`, true)) || [];
    idx.sort();
    setMonths(idx);
    return idx;
  }, [groupCode]);

  const loadMonths = useCallback(async (list) => {
    const entries = await Promise.all(list.map(async (mk) => [mk, (await getVal(`diary:${groupCode}:${mk}`, true)) || []]));
    setDiaryByMonth((prev) => {
      const next = { ...prev };
      entries.forEach(([mk, e]) => { next[mk] = e; });
      return next;
    });
  }, [groupCode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const idx = await loadIdx();
      const recent = idx.slice(-6).reverse();
      if (!cancelled) await loadMonths(recent);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [groupCode, refreshFlag, loadIdx, loadMonths]);

  const loadMore = async () => {
    const remaining = [...months].reverse().slice(loadedCount, loadedCount + 6);
    if (remaining.length === 0) return;
    await loadMonths(remaining);
    setLoadedCount((c) => c + 6);
  };

  const visibleMonths = [...months].reverse().slice(0, loadedCount);
  const allEntries = visibleMonths.flatMap((mk) => diaryByMonth[mk] || []);
  allEntries.sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div style={{ padding: "14px 14px 90px" }}>
      <button
        onClick={() => setOpenForm(true)}
        style={{
          width: "100%", padding: "13px", marginBottom: 14, borderRadius: 12,
          border: `1.5px dashed ${theme.moss}`, background: theme.cream, color: theme.mossDeep,
          fontFamily: F_BODY, fontWeight: 600, fontSize: 14, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
      >
        <Camera size={18} /> 今日の一枚を残す
      </button>

      {loading ? (
        <div style={{ textAlign: "center", padding: 30 }}><Loader2 className="animate-spin" size={20} color={theme.inkSoft} /></div>
      ) : allEntries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 20px", color: theme.inkSoft, fontFamily: F_BODY, fontSize: 13.5 }}>
          まだ日記がありません。
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {allEntries.map((e) => (
            <button
              key={e.id}
              onClick={() => setViewing(e)}
              style={{
                aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", border: `1px solid ${theme.line}`,
                background: theme.paperDeep, cursor: "pointer", padding: 0, position: "relative",
              }}
            >
              {e.photo ? (
                <img src={e.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                  {e.mood === "元気" ? "😊" : e.mood === "不調" ? "😟" : "😐"}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {loadedCount < months.length && (
        <button
          onClick={loadMore}
          style={{
            width: "100%", padding: "11px", marginTop: 14, borderRadius: 10, border: `1px solid ${theme.line}`,
            background: "transparent", color: theme.inkSoft, fontFamily: F_BODY, fontSize: 13, cursor: "pointer",
          }}
        >
          もっと読み込む
        </button>
      )}

      {openForm && (
        <DiaryForm
          groupCode={groupCode}
          author={author}
          onClose={() => setOpenForm(false)}
          onSaved={() => { setOpenForm(false); loadIdx().then((idx) => loadMonths([...idx].reverse().slice(0, loadedCount))); }}
        />
      )}

      {viewing && (
        <Modal title={fmtDateHeading(viewing.date)} onClose={() => setViewing(null)}>
          {viewing.photo && <img src={viewing.photo} alt="" style={{ width: "100%", borderRadius: 10, marginBottom: 12 }} />}
          <div style={{ fontFamily: F_BODY, fontSize: 14, color: theme.ink, marginBottom: 8 }}>
            {viewing.mood === "元気" ? "😊 元気" : viewing.mood === "不調" ? "😟 不調" : "😐 普通"}
          </div>
          {viewing.caption && <div style={{ fontFamily: F_BODY, fontSize: 14, color: theme.ink, lineHeight: 1.7 }}>{viewing.caption}</div>}
          <div style={{ fontFamily: F_MONO, fontSize: 11.5, color: theme.inkSoft, marginTop: 12 }}>記録者：{viewing.author}</div>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   SETTINGS TAB
------------------------------------------------------------------- */
function SettingsTab({ profile, pet, onProfileChange, onPetChange, onLeaveGroup }) {
  const [name, setName] = useState(profile.name);
  const [savingName, setSavingName] = useState(false);
  const [copied, setCopied] = useState(false);

  const [petName, setPetName] = useState(pet.name);
  const [species, setSpecies] = useState(pet.species);
  const [breed, setBreed] = useState(pet.breed || "");
  const [birthday, setBirthday] = useState(pet.birthday || "");
  const [savingPet, setSavingPet] = useState(false);

  const saveName = async () => {
    if (!name.trim()) return;
    setSavingName(true);
    const updated = { ...profile, name: name.trim() };
    await setVal("profile", updated, false);
    onProfileChange(updated);
    setSavingName(false);
  };

  const savePet = async () => {
    setSavingPet(true);
    const updated = { ...pet, name: petName.trim() || pet.name, species, breed: breed.trim(), birthday };
    await setVal(`pet:${profile.groupCode}`, updated, true);
    onPetChange(updated);
    setSavingPet(false);
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(profile.groupCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ padding: "14px 14px 90px" }}>
      <SectionLabel>あなた</SectionLabel>
      <Panel style={{ padding: 16, marginBottom: 18 }}>
        <TextField label="表示名" value={name} onChange={(e) => setName(e.target.value)} />
        <PrimaryButton onClick={saveName} disabled={savingName}>{savingName ? "保存中…" : "保存"}</PrimaryButton>
      </Panel>

      <SectionLabel>家族・共有</SectionLabel>
      <Panel style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ fontFamily: F_BODY, fontSize: 12.5, color: theme.inkSoft, marginBottom: 6 }}>家族の合言葉</div>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          background: theme.paper, border: `1px solid ${theme.line}`, borderRadius: 8, padding: "9px 12px", marginBottom: 14,
        }}>
          <span style={{ fontFamily: F_MONO, fontSize: 14.5, color: theme.ink }}>{profile.groupCode}</span>
          <button onClick={copyCode} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: theme.moss, fontFamily: F_BODY, fontSize: 12.5 }}>
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "コピー済み" : "コピー"}
          </button>
        </div>
        <div style={{ fontFamily: F_BODY, fontSize: 12, color: theme.inkSoft, marginBottom: 16, lineHeight: 1.6 }}>
          この合言葉を家族に伝えると、同じノートを共有できます。合言葉を知っていれば誰でも記録を見られるので、家族以外には教えないでください。
        </div>
        <button
          onClick={onLeaveGroup}
          style={{
            display: "flex", alignItems: "center", gap: 6, background: "none",
            border: `1px solid ${theme.line}`, borderRadius: 8, padding: "9px 14px",
            color: theme.rust, fontFamily: F_BODY, fontSize: 13, cursor: "pointer",
          }}
        >
          <LogOut size={15} /> 別の合言葉に切り替える
        </button>
      </Panel>

      <SectionLabel>ペットの情報</SectionLabel>
      <Panel style={{ padding: 16, marginBottom: 18 }}>
        <TextField label="名前" value={petName} onChange={(e) => setPetName(e.target.value)} />
        <ChoiceRow
          label="種類" value={species} onChange={setSpecies}
          options={[{ value: "dog", label: "🐶 犬" }, { value: "cat", label: "🐱 猫" }, { value: "other", label: "🐾 その他" }]}
        />
        <TextField label="犬種・猫種" value={breed} onChange={(e) => setBreed(e.target.value)} />
        <TextField label="お誕生日" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
        <PrimaryButton onClick={savePet} disabled={savingPet}>{savingPet ? "保存中…" : "保存"}</PrimaryButton>
      </Panel>

      <div style={{ fontFamily: F_BODY, fontSize: 11.5, color: theme.inkSoft, textAlign: "center", lineHeight: 1.7 }}>
        記録は自動的に消えません。家族みんなでずっと残していけます。
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: 1, color: theme.inkSoft, marginBottom: 8, marginTop: 4 }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------
   MAIN APP
------------------------------------------------------------------- */
const TABS = [
  { key: "timeline", label: "きろく", icon: PawPrint },
  { key: "weight", label: "体重", icon: Scale },
  { key: "diary", label: "日記", icon: Camera },
  { key: "settings", label: "設定", icon: Settings },
];

export default function App() {
  useEffect(() => { ensureFonts(); }, []);

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profile, setProfile] = useState(null);
  const [pet, setPet] = useState(null);
  const [tab, setTab] = useState("timeline");
  const [refreshFlag, setRefreshFlag] = useState(0);

  useEffect(() => {
    (async () => {
      const p = await getVal("profile", false);
      setProfile(p);
      if (p) {
        const petData = await getVal(`pet:${p.groupCode}`, true);
        setPet(petData);
      }
      setLoadingProfile(false);
    })();
  }, []);

  if (loadingProfile) {
    return (
      <div style={{ minHeight: "100vh", background: theme.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="animate-spin" size={26} color={theme.moss} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ fontFamily: F_BODY }}>
        <Onboarding onDone={async (p) => {
          setProfile(p);
          const petData = await getVal(`pet:${p.groupCode}`, true);
          setPet(petData);
        }} />
      </div>
    );
  }

  if (!pet) {
    return (
      <div style={{ fontFamily: F_BODY }}>
        <PetSetup groupCode={profile.groupCode} onDone={(p) => setPet(p)} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: F_BODY, minHeight: "100vh", background: theme.paper }}>
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 0px; }
        button { -webkit-tap-highlight-color: transparent; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>

      <div style={{
        position: "sticky", top: 0, zIndex: 10, background: theme.paper,
        borderBottom: `1px solid ${theme.line}`, padding: "14px 16px 10px",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <PawPrint size={19} color={theme.moss} />
        <span style={{ fontFamily: F_DISPLAY, fontWeight: 700, fontSize: 17, color: theme.ink }}>ぶくろく</span>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        {tab === "timeline" && <Timeline groupCode={profile.groupCode} author={profile.name} pet={pet} refreshFlag={refreshFlag} />}
        {tab === "weight" && <WeightTab groupCode={profile.groupCode} author={profile.name} refreshFlag={refreshFlag} />}
        {tab === "diary" && <DiaryTab groupCode={profile.groupCode} author={profile.name} refreshFlag={refreshFlag} />}
        {tab === "settings" && (
          <SettingsTab
            profile={profile}
            pet={pet}
            onProfileChange={setProfile}
            onPetChange={setPet}
            onLeaveGroup={async () => {
              await setVal("profile", null, false);
              setProfile(null);
              setPet(null);
            }}
          />
        )}
      </div>

      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, background: theme.cream,
        borderTop: `1px solid ${theme.line}`, display: "flex", zIndex: 20,
      }}>
        <div style={{ display: "flex", width: "100%", maxWidth: 520, margin: "0 auto" }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            const Ico = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setRefreshFlag((f) => f + 1); }}
                style={{
                  flex: 1, background: "none", border: "none", padding: "9px 0 10px",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer",
                }}
              >
                <Ico size={19} color={active ? theme.moss : theme.inkSoft} strokeWidth={active ? 2.4 : 2} />
                <span style={{ fontFamily: F_BODY, fontSize: 10.5, color: active ? theme.moss : theme.inkSoft, fontWeight: active ? 600 : 400 }}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
