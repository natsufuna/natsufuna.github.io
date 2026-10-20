# natsufuna.github.io — 8月暦の日記

https://natsufuna.github.io

日付はすべて **8月暦**（8月1日を「8月1日」とし、翌年7月31日まで日を数え続ける暦）で表示されます。
8月暦は記事のファイル名の日付から自動で計算されるので、タイトルを書く必要はありません。

## 書き方

### スマホ・iPad から
1. https://natsufuna.github.io/write/ を開き、ホーム画面に追加する（Android の Chrome: メニュー →「ホーム画面に追加」／iPad の Safari: 共有 →「ホーム画面に追加」）。
2. 初回だけ ⚙ から GitHub トークンを設定する（端末ごとに1回）。
3. 書いて「保存する」。1〜2分でサイトに反映されます。

- **日付**: 端末の現地時刻から自動で決まります。午前4時より前に書いたものは前日の日記になります（⚙ で変更可）。
- **音声入力**: 「🎙 話して書く」か、キーボードのマイクで話します。「音声入力を整える」に印をつけて保存すると、句読点と言い淀みを AI が整えてから公開します。文体は過去の日記に寄せます。
- **非公開**: 「非公開にする」に印をつけると、サイトには載りません（下の注意を参照）。
- **写真**: 端末で縮小し、位置情報を消してから送ります。
- **編集**: 「最近の日記」から開くと、過去の日記を直せます。
- 書きかけの文章はその端末に自動で保存されます。

### PC から
これまでどおり `_posts/YYYY-MM-DD-diary.md` を書いて push しても構いません。front matter の `title` は省略できます。

```markdown
---
category: diary
tags:
- JP
---
本文。1行ごとに改行されます。
```

## 初回のセットアップ（1回だけ）

1. **Pages の公開方法を切り替える**: リポジトリの Settings → Pages → Build and deployment → Source を「**GitHub Actions**」にする。
2. **GitHub トークンを作る**（投稿ページ用）: Settings（個人）→ Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
   - Repository access: *Only select repositories* → `natsufuna.github.io`
   - Permissions: **Contents: Read and write**（Metadata: Read は自動で付きます）
   - 有効期限が切れたら作り直して、各端末の ⚙ で貼り直してください。
3. **Claude の API キーを登録する**（音声の整形用。使わないなら不要）: https://console.anthropic.com でキーを作り、リポジトリの Settings → Secrets and variables → Actions → New repository secret に `ANTHROPIC_API_KEY` として登録。キーがないとき、整形は行われずにそのまま公開されます。

## 非公開の日記についての注意

非公開の日記はサイトには載りませんが、このリポジトリは公開リポジトリなので、**GitHub 上のファイルとしては誰でも読めます**。
本当に読まれたくない場合は、日記の原稿を非公開リポジトリに移し、ビルドした結果だけをこのリポジトリに公開する構成に変える必要があります。

## しくみ

- `_posts/` 日記の原稿（Markdown）。URL は旧サイトと同じ `/diary/YYYY/MM/DD/diary.html`。
- `_inbox/` 整形待ちの音声入力。push されると GitHub Actions（`.github/workflows/deploy.yml`）が `scripts/tidy.mjs` で整形して `_posts/` に移し、サイトを公開し直します。整形前の文章は Git の履歴に残ります。
- `assets/js/august.js` 8月暦の計算（サイトと投稿ページで共用）。
- サイトは [Eleventy](https://www.11ty.dev/) で生成しています。手元で確認するには `npm install` → `npm run serve`。
