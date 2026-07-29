// 自动同步后端配置（零手动同步到服务器）
// 当前支持 supabase Storage。填好下面信息并把 enabled 改为 true 后，
// 网页打开会自动从服务器拉取题库，并在本地有改动时自动推送（无需任何手动操作）。
// 注意：anonKey 是 Supabase 设计上可公开的前端密钥，写权限需靠 bucket 策略控制。
window.TIHAI_SYNC = {
  enabled: false,            // ← 填好下面信息后改为 true
  backend: 'supabase',
  supabaseUrl: '',           // 例如 https://xxxxxxxx.supabase.co
  anonKey: '',               // Supabase 控制台 Project Settings → API → anon public key
  bucket: 'tihai',           // Storage bucket 名（需设为 public 且允许 anon 读写）
  path: 'bank.json'          // 存储对象路径
};
