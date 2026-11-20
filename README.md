# 拾光笔记

用 Hugo 构建的静态博客，部署在阿里云广州的一台小机器上（服务器地址见 `deploy/.deploy_host`）。

## 写作方式

1. **在线写（推荐）**：打开 <https://app.pagescms.org>，用 GitHub 登录并授权本仓库，直接在浏览器里编辑文章、拖图上传、点保存。
2. **手机上应急**：在 GitHub 网页端直接改 `blog/content/posts/*.md`。
3. **本地写**：`./new-post.sh "标题"` 新建，`./preview.sh` 本地预览（<http://127.0.0.1:1313>），`./deploy/deploy.sh` 手动发布。

前两种方式提交后，GitHub Actions 会自动构建并发布，约 1–2 分钟生效。

## 目录

```
blog/                  Hugo 站点源码
  content/posts/       文章（Markdown）
  content/about.md     关于页
  layouts/             模板
  assets/              样式与脚本
  static/images/       图片（后台拖拽上传的图会进这里）
  hugo.toml            站点配置
deploy/
  blog.conf            Nginx 配置
  deploy.sh            手动发布脚本
  beian.md             备案备忘
.github/workflows/     GitHub Actions：自动构建 + 部署
.pages.yml             Pages CMS 后台的字段配置
```

## 发布链路

```
Pages CMS / GitHub 网页 / 本地
        ↓ 提交到 main
GitHub Actions（装 Hugo → 构建）
        ↓ tar over ssh
/var/www/blog（Nginx 提供的目录，原子切换）
        ↓
http://<服务器IP>/
```

## 备注

- 域名 `mints.vip` 已解析到本机且证书已就绪，但未完成 ICP 备案，阿里云会拦截 80/443 上的该域名，所以当前用 IP 访问。备案通过后把 `blog/hugo.toml` 的 `baseURL` 改回 `https://mints.vip/` 即可。
- 图片默认写进 `blog/static/images/`，正文里用 `/images/xxx.png` 引用。
