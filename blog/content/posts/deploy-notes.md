---
title: "这台小机器的部署笔记"
date: 2026-11-19T16:40:00+08:00
summary: "2 核 1.7G、Debian 13、广州节点：把静态博客放上去需要做哪些事，以及为什么没装 Docker。"
tags: ["Nginx", "运维", "Debian"]
categories: ["技术"]
---

记录一下这台机器的实际情况和部署选择，省得以后再翻聊天记录。

## 机器规格

| 项目 | 值 |
| --- | --- |
| 地域 | 阿里云 cn-guangzhou |
| 系统 | Debian GNU/Linux 13 (trixie) |
| 内核 | 6.12.105+deb13-amd64 |
| CPU | 2 vCPU |
| 内存 | 1.7 GiB |
| 系统盘 | 40 GB（已用 1.9 GB） |
| 内网 IP | 172.18.248.75/20 |

## 为什么用静态站而不是 WordPress

1.7G 内存跑 MySQL + PHP 当然跑得动，但没必要：

- 静态站没有数据库，不会被扫后台、不会被拖库
- 页面是纯文件，Nginx 直接吐，1G 内存能扛住正常量级的访问
- 内容全在 Git 和本地 Markdown 里，随时能搬走

写文章需要后台的话，再补一个也来得及。先简单。

## Nginx 配置要点

```nginx
server {
    listen 80;
    server_name _;
    root /var/www/blog;
    index index.html;

    location / {
        try_files $uri $uri/ $uri/index.html =404;
    }

    location ~* \.(css|js|svg|png|jpg|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000";
    }
}
```

几个容易忘的点：

- `try_files` 里要带上 `$uri/index.html`，否则 Hugo 生成的目录式 URL 会 404
- 静态资源加长缓存，HTML 不加，避免改版后用户看到旧页面
- 开 gzip，文本资源能省 70% 左右

## 关于防火墙

Debian 13 默认没装 ufw，真正的入口在**阿里云安全组**。80/443 要在控制台放行，机器里改 iptables 没用。

## 下一步

- 绑域名 + HTTPS
- 加一个自动备份，把文章目录同步回本地
