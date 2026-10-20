// 8月暦: 8月1日を「8月1日」として、翌年7月31日まで日を数え続ける暦。
// ビルド時 (Node) とブラウザの両方から import される。

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
export const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, "0");

// y, m (1-12), d から 8月暦を求める。summer はその8月暦が始まった年。
export function august(y, m, d) {
  const summer = m >= 8 ? y : y - 1;
  const day = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(summer, 7, 1)) / DAY_MS) + 1;
  return { summer, day, label: `8月${day}日` };
}

// "2025-10-03" -> { y, m, d, iso, weekday, summer, day, label, season }
export function describe(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, iso, weekday: WEEKDAYS[wd], ...august(y, m, d), season: seasonOf(m) };
}

export function isoOf(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

// 端末のローカル時刻から「どの日の日記か」を決める。
// cutoffHour 時より前に書いたものは前日の日記とみなす。
export function diaryDateOf(now = new Date(), cutoffHour = 4) {
  const t = new Date(now);
  if (t.getHours() < cutoffHour) t.setDate(t.getDate() - 1);
  return isoOf(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

// タイムゾーン付きのローカル時刻 (例: 2026-10-20T23:41:00+02:00)
export function localTimestamp(now = new Date()) {
  const off = -now.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return (
    `${isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
    `${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`
  );
}

export function seasonOf(m) {
  if (m >= 6 && m <= 9) return "summer";
  if (m === 10 || m === 11) return "autumn";
  if (m === 12 || m <= 2) return "winter";
  return "spring";
}

export function summerLabel(summer) {
  return `${summer}年の夏`;
}

// 日付だけを表すタグ (旧サイトの "2022/07" など) は表示しない
export function displayTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map(String).filter((t) => t && !/^\d{4}\/\d{2}$/.test(t));
}
