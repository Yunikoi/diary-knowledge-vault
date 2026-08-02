# Diary ↔ Knowledge Vault

类 Typora 的本地 Markdown 笔记：左侧文件树、中间编辑/预览、右侧双向链接。

## 功能

- 日记 / 知识 双区文件库（`vault/diary`、`vault/knowledge`）
- Markdown 编辑 + 实时预览（编辑 / 分栏 / 预览）
- `[[知识标题]]` Wiki 链接，点击跳转
- **反向链接**：打开知识页可看到哪些日记引用了它（反之亦然）
- 缺失链接一键创建知识卡片
- 自动保存

## 启动

```bash
cd d:\Study\diary-knowledge-vault
npm install
npm run dev
```

浏览器打开：http://localhost:5173（若被占用会自动换端口）  
API：http://localhost:18788

## 用法

1. 在日记里写 `[[示例概念]]`
2. 预览模式点击链接 → 跳到知识页
3. 右侧「反向链接」看到日记引用

笔记文件就是普通 `.md`，可用 VS Code / Typora 同步编辑 `vault/` 目录。
