---
title: "自己搭一个订阅转换，顺手写了个一键脚本"
date: 2026-11-22T01:40:00+08:00
summary: "公共转换站要你把订阅链接贴进去，那玩意儿等于账号密码。于是我在自己的小机器上跑了 subconverter + sub-web，又写了个脚本，一条命令装完。"
tags: ["Docker", "Nginx", "自建服务", "HTTPS"]
categories: ["技术"]
---

之前一直用公共的订阅转换站。省事是真省事，可你得把订阅链接原样贴进去，那东西等于账号密码；再加上隔三差五抽风、限速、有时候还给你塞点广告节点，用着别扭。

上周终于动手在自己机器上搭了一套，顺手写了个脚本扔 GitHub 上。想快的直接看第一段，想弄明白每一步在干嘛的往后翻。

> 先说一句：这套东西自己用没问题，别拿去公开给一群人用。国内服务器上用域名对外提供服务，还得先把备案走完。

## 懒人版：一条命令

```bash
curl -fsSL \
  https://raw.githubusercontent.com/mints-7/substack/main/install.sh \
  | sudo bash
```

跑完屏幕上会打一个地址，浏览器打开就是转换页面。后端默认只绑 `127.0.0.1`，外网碰不到，只有 Nginx 能进。

有域名的话多两个参数：

```bash
curl -fsSL \
  https://raw.githubusercontent.com/mints-7/substack/main/install.sh \
  | sudo bash -s -- --domain sub.example.com --email you@example.com
```

域名要提前解析到这台机器，80 和 443 在安全组里放行，不然最后 certbot 那步会卡住。脚本会写 Nginx 反代、签证书，装完直接 `https://你的域名`。

脚本源码在 [mints-7/substack](https://github.com/mints-7/substack)，一百多行，能看懂再跑，不放心就照着下面自己敲。

## 这套东西其实就三件

真正干活的是 subconverter，一个转换引擎，提供 `/sub?target=clash&url=...` 这种接口；sub-web 是个纯前端页面，帮你把上面那条长链接拼出来；远程配置是一份 ini，决定分组和分流规则。

请求是这么走的：

```txt
浏览器
  ↓
sub-web（拼链接的静态页）
  ↓
subconverter（/sub 接口）
  ↓
机场订阅 / 单个节点链接
```

第一次搭最容易栽的地方在这：sub-web 自己没有 `/sub` 接口。生成链接报 404，十有八九是把前端地址填到了「后端地址」那一栏。

## 自己敲一遍

### 机器

1 核 1G 能跑。我测试用的这台是 2 核 1.7G 的 Debian 13，两个容器空载加起来不到 5MB 内存，比我预想的省。

先装 Docker。Debian 自带的包就够用，不用折腾官方源：

```bash
apt update && apt install -y docker.io
systemctl enable --now docker
```

**这里有个坑**。国内直连 Docker Hub 基本拉不动，我第一次跑卡了二十分钟，最后是 `context deadline exceeded`。解决办法是配个镜像加速：

```bash
cat > /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": ["https://docker.1panel.live", "https://docker.xuanyuan.me"]
}
EOF
systemctl restart docker
```

地址会失效，哪天拉不动了换一个就行。脚本里我写了「先直连试 90 秒，不行就自动换加速器重试一次」，手工装的话自己盯着点。

### 起后端

```bash
mkdir -p /opt/substack && cd /opt/substack

docker run -d --name subconverter --restart always \
  -p 127.0.0.1:25500:25500 \
  tindy2013/subconverter:latest
```

`-p 127.0.0.1:25500:25500` 是故意的，只绑回环。写成 `-p 25500:25500` 就等于把一个没鉴权的接口挂在公网，用不了多久就会被别人的脚本刷。

试试起来没有：

```bash
curl -s http://127.0.0.1:25500/version
# subconverter v0.9.0-a0d4eab backend
```

然后写一份 `/opt/substack/pref.ini`：

```ini
[common]
api_mode=true
api_access_token=换成一串随机的
enable_cache=true
cache_subscription=300
cache_config=3600
exclude_remarks=(到期|剩余流量|官网|订阅|过期)
log_level=info

[server]
listen=0.0.0.0
port=25500

[advanced]
max_pending_connections=200
max_concurrent_threads=4
```

`api_mode` 打开以后，读本地文件那类接口要带 token，普通的 `url=` 转换不受影响。`exclude_remarks` 是个正则，把机场塞进来的「剩余流量」「官网地址」这些假节点滤掉，客户端里清爽不少。`max_concurrent_threads` 别贪，1G 内存开到 4 就够了。

挂载重建：

```bash
docker rm -f subconverter
docker run -d --name subconverter --restart always \
  -p 127.0.0.1:25500:25500 \
  -v /opt/substack/pref.ini:/base/pref.ini:ro \
  tindy2013/subconverter:latest
```

拿自己的订阅试一次。`url` 参数必须 URL 编码，手拼特别容易漏：

```bash
SUB='https://example.com/api/v1/client/subscribe?token=xxxx'
ENC=$(python3 -c "import urllib.parse,sys; \
print(urllib.parse.quote(sys.argv[1],safe=''))" "$SUB")
curl -s "http://127.0.0.1:25500/sub?target=clash&url=$ENC" | head -5
```

我用一条测试链接跑出来的结果是：

```txt
Proxy:
  - {name: Example1, server: 192.168.100.1, port: 8888, type: ss, cipher: aes-128-gcm, password: test}
```

能出这个就通了。

### 起前端

```bash
docker run -d --name subweb --restart always \
  -p 58080:80 \
  -e VITE_SUBCONVERTER_DEFAULT_BACKEND=\
http://你的IP:25500 \
  careywong/subweb:latest
```

注意镜像名是 `subweb`，不是老教程里的 `sub-web`。环境变量就是页面上那个「后端地址」。

要是这时候后端还只绑在 `127.0.0.1`，浏览器其实连不上它。所以要么先在局域网里把 IP 放开测，要么直接走下一步的 Nginx：反代之后前后端同域，后端就能安心缩回本机。

### 套上 Nginx 和证书

我推荐前后端放同一个域名，前端吃 `/`，后端吃 `/sub`。这样浏览器里是同源请求，跨域那些破事根本不用管。

```nginx
# /etc/nginx/conf.d/substack-limit.conf
limit_req_zone $binary_remote_addr zone=substack:10m rate=2r/s;
```

```nginx
# /etc/nginx/sites-available/substack.conf
server {
    listen 80;
    server_name sub.example.com;
    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:58080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /sub {
        limit_req zone=substack burst=20 nodelay;
        proxy_pass http://127.0.0.1:25500;
        proxy_read_timeout 30s;
        add_header Cache-Control "no-store";
    }

    location = /version {
        proxy_pass http://127.0.0.1:25500;
    }
}
```

启用、检查、签证书：

```bash
ln -s /etc/nginx/sites-available/substack.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
apt install -y certbot python3-certbot-nginx
certbot --nginx -d sub.example.com
```

别学我一开始那样，上来就把 443 的 server 块写死，证书还没签出来 `nginx -t` 直接报错。先跑 80，让 certbot 自己往里加 ssl 段最省事。

## 别让它裸奔

搭完能用了，还有三件事值得做，不做迟早后悔：

1. **后端只绑回环**，就是上面那个 `-p 127.0.0.1:25500:25500`，别改。
2. **token 换成随机串**，`openssl rand -hex 16` 生成一个。
3. **限流**，就是配置里那个 `limit_req`，2 r/s、突发 20，正常自己用完全够，脚本刷子顶不住。

至于给 `/sub` 加 Basic 认证，我不建议。客户端更新订阅时带账号密码很别扭，限流加 token 已经能挡掉绝大多数顺手白嫖的。

## 我踩到的几个坑

**镜像拉不下来**。前面说了，卡了二十分钟。加速器配好之后，`docker pull` 几十秒就完事。

**域名被拦**。我这台是广州的机器，域名备案还没下来，80/443 上带域名的请求直接被拦成 403。所以现在线上还是 `http://IP`，备案过了再切。这事儿纯静态博客也躲不过，跟转不转换没关系。

**生成链接 404**。第一次就栽在这，后端地址填成了前端地址。

**控制台报 CORS**。前后端拆成两个子域，浏览器拦。后来合成一个域名走 `/sub`，世界清净了。

**`No nodes were resolved`**。订阅本身拉不到，可能过期了、要特定 UA，或者机器出不去。先 `curl` 一下订阅本身。

**短链接那一栏用不了**。sub-web 的短链是调外部服务的，不是自带功能，别指望。不想折腾就用长链接，或者用 `/getprofile` 把参数收进一个文件。

## 最后

脚本在 [github.com/mints-7/substack](https://github.com/mints-7/substack)，支持 `--domain`、`--no-nginx`、`--mirror`、`--uninstall` 这些参数，`--dry-run` 可以先看它想干什么再决定跑不跑。有 bug 去开 issue。

整套东西最值钱的地方其实不是「转换」，而是那个只在你自己机器上跑、谁都调不走的订阅链接。
