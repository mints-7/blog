# 博客使用说明

站点源码在 `blog/`，Hugo 二进制在 `.tools/hugo`，部署脚本在 `deploy/deploy.sh`。

> 日常写作看这份就够：[../写作指南.md](../写作指南.md)
> 三个脚本：`./new-post.sh "标题"` 新建、`./preview.sh` 预览、`./deploy/deploy.sh` 发布

## 日常写作

```bash
cd blog
../.tools/hugo new content posts/文章标题.md   # 新建，默认 draft: true
../.tools/hugo server -D                       # 本地预览 http://localhost:1313
```

写完把 front matter 里的 `draft` 改成 `false`，然后发布：

```bash
./deploy/deploy.sh
```

## 文件结构

```
blog/
├── hugo.toml              # 站点配置：标题、作者、菜单、分页
├── content/
│   ├── posts/             # 文章（Markdown）
│   ├── about.md           # 关于页
│   └── archives/_index.md # 归档页
├── layouts/               # 模板
├── assets/css|js/         # 样式与脚本（构建时压缩合并）
└── static/                # 原样拷贝的文件（favicon 等）
```

## 改站点信息

都在 `blog/hugo.toml` 的 `[params]` 里：

- `title` — 站点名（现在叫「拾光笔记」）
- `tagline` — 首页副标题
- `description` — SEO 描述
- `avatarText` — 左上角方块里的字（现在「拾」）
- `author` — 页脚署名
- `since` — 建站年份

`baseURL` 现在是 `http://8.163.135.192/`，绑域名后改成 `https://你的域名/`。

## 发布链路

| 环节 | 做法 |
| --- | --- |
| 构建 | 本地 Hugo 生成 `blog/public/`（纯静态） |
| 上传 | tar over ssh，推到 `/var/www/blog`，原子切换目录 |
| 服务 | 服务器 Nginx 直接读静态文件 |
| 认证 | 专用密钥 `deploy/.ssh/blog_deploy`（已加到服务器 root 的 authorized_keys） |

服务器上不需要装 Hugo，也不需要 Node。

## 服务器侧

- Nginx 配置：`/etc/nginx/sites-available/blog.conf`
- 站点目录：`/var/www/blog`
- 重载：`ssh -i deploy/.ssh/blog_deploy root@8.163.135.192 'nginx -t && systemctl reload nginx'`

## HTTPS

- 证书：Let's Encrypt，`mints.vip`，签发方式 `certbot certonly --webroot -w /var/www/blog -d mints.vip`
- 路径：`/etc/letsencrypt/live/mints.vip/`
- 续期：`certbot.timer` 每天 03:07 自动跑，`certbot renew --dry-run` 已验证通过；到期 2027-02-18
- HTTP(80) 只服务 ACME 校验，其余全部 301 到 HTTPS；HSTS 已开
- 加 www 域名：在阿里云云解析加 `www` CNAME → `mints.vip`，然后
  `certbot certonly --webroot -w /var/www/blog -d mints.vip -d www.mints.vip --expand`

## 域名状态（重要）

`mints.vip` 未备案，阿里云对 80/443 上带域名的请求直接拦截（HTTP 403 / TLS 重置）。
裸 IP `http://8.163.135.192` 不受影响，Nginx 已拆出默认 server 兜底。
备案条件、流程与收尾见 [beian.md](beian.md)。

## 待办

- [x] 阿里云安全组放行 80/443
- [x] 绑域名 + HTTPS（备案通过后自动恢复）
- [x] `www.mints.vip` CNAME → `mints.vip`（备案后再 `--expand` 加进证书）
- [ ] mints.vip 完成 ICP 备案
- [ ] 定期备份 `blog/content/`（现在只在本地这台 Mac 上）
- [ ] 服务器 root 密码是主机名，建议改密 + 关掉密码登录（只留密钥）
