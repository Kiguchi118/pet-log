# ぶくろく（無料・外部運用版）セットアップ手順

**GitHub Pages（無料ホスティング）＋ Firebase Firestore（無料データベース）** だけで動きます。
クレジットカード登録は不要です。

このバージョンは、あなたと配偶者のお二人だけで使う前提で、合言葉入力の画面は無くしてあります。
初めて開いたときにペットの情報を1回だけ登録すれば、次回からはすぐホーム画面が表示されます。

---

## アップロードするファイル一式

```
index.html
manifest.json
icons/
  icon-192.png
  icon-512.png
  icon-512-maskable.png
  icon-180.png
  favicon-32.png
```

このフォルダ構成のまま、GitHubリポジトリの直下にアップロードしてください（`icons` フォルダごと）。

---

## 1. Firebaseプロジェクトを作る

1. https://console.firebase.google.com/ を開く（Googleアカウントでログイン）
2. 「プロジェクトを作成」→ 名前を入力（例：bukuroku）→ Googleアナリティクスは「オフ」でOK →「プロジェクトを作成」

## 2. Webアプリを登録してconfigを取得する

1. プロジェクト画面で `</>`（Webアプリ）のアイコンをクリック
2. ニックネームを入力→「アプリを登録」
3. 表示される `firebaseConfig` の6つの値をコピー
4. `index.html` 上部の以下の部分に、コピーした値を貼り付ける

```js
const firebaseConfig = {
  apiKey: "ここにAPIキーを貼り付け",
  authDomain: "ここにauthDomainを貼り付け",
  projectId: "ここにprojectIdを貼り付け",
  storageBucket: "ここにstorageBucketを貼り付け",
  messagingSenderId: "ここにmessagingSenderIdを貼り付け",
  appId: "ここにappIdを貼り付け"
};
```

（すぐ下にある `FAMILY_ID` はそのままで大丈夫です。合言葉の代わりに使う固定の名前で、書き換える必要はありません。）

## 3. 匿名ログインを有効にする

「Authentication」→「Sign-in method」→「匿名」を有効にして保存

## 4. Firestore Database を作る

「Firestore Database」→「データベースを作成」→ ロケーションは `asia-northeast1（東京）` → 「本番環境モードで開始」

## 5. セキュリティルールを設定する

「ルール」タブで以下に置き換えて「公開」

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 6. GitHubにアップロードする

1. 新しいリポジトリを作成（例：pet-log）
2. `index.html`・`manifest.json`・`icons` フォルダを、フォルダ構成を保ったままアップロード（「Add file」→「Upload files」でドラッグ&ドロップすれば `icons/` ごとアップロードできます）

## 7. index.html内のconfigを書き換える

1. リポジトリ上で `index.html` を開き、鉛筆マーク（Edit this file）
2. Step2でコピーしたFirebaseの値に置き換える → Commit

## 8. GitHub Pagesを有効にする

「Settings」→「Pages」→ Branch: `main` / フォルダ: `/(root)` → Save → 数分後に
`https://あなたのユーザー名.github.io/リポジトリ名/` が発行されます

## 9. 動作確認

URLを開く→初回だけペット情報を登録→記録を試しに1つ追加→再読み込みしても残っていればOK

---

## 📱 スマホのホーム画面にアプリとして追加する

オリジナルのアイコン（肉球ロゴ）付きで、ホーム画面からアプリのように開けます。

**iPhone（Safari）**
1. 発行されたURLをSafariで開く
2. 下の共有ボタン（□に↑）をタップ
3. 「ホーム画面に追加」を選択→追加

**Android（Chrome）**
1. 発行されたURLをChromeで開く
2. 右上の「⋮」メニュー→「ホーム画面に追加」または「アプリをインストール」

どちらも、ホーム画面に肉球アイコンのアプリとして表示されます。

---

## 補足

- **無料枠**：Firestoreの無料枠（1日あたり読み取り5万回・書き込み2万回、保存容量1GiB）は、お二人での利用なら十分すぎるほど余裕があります。
- **体重グラフでエラーが出たら**：ブラウザのコンソールに表示される「インデックス作成」のリンクをクリックすれば自動解決します（初回だけの仕様です）。
- **今後の改良**：`index.html` は1枚のファイルで完結しています。GitHub上で直接編集→Commitするだけで、1〜2分後にサイトに反映されます。
- **バックアップ**：Firebaseコンソールの「Firestore Database」からいつでもデータを確認できます。
