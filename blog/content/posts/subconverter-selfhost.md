---
title: "从零搭一套自己的订阅转换服务"
date: 2026-11-22T01:10:00+08:00
summary: "公共转换站会记录你的订阅、会限速、也会挂。这篇从机器准备、Docker 起 subconverter 和 sub-web，到 Nginx 反代、HTTPS、限流加固，把一套只用给自己的订阅转换服务搭完。"
tags: ["Docker", "Nginx", "自建服务", "HTTPS"]
categories: ["技术"]
---

公共订阅转换站用起来很省事，但它同时握着两样最不该外借的东西：你的订阅链接（等于账号密码），和你每次转换的节点列表。它还可能半夜挂掉、给你限速、在结果里插广告。

所以这次的活是：在一台自己的小机器上，把 [subconverter](https://github.com/tindy2013/subconverter)（转换后端）和 [sub-web](https://github.com/CareyWang/sub-web)（网页界面）跑起来，只给自己用。

> 本文只讲软件部署。服务请自用，不要开放给陌生人；在国内服务器上对外提供这类服务，还涉及备案和运营商政策，自己心里要有数。

## 一、先把三个概念分清

| 名字 | 是什么 | 跑在哪 |
| --- | --- | --- |
| subconverter | 真正的转换引擎，提供 `/sub?target=...&url=...` 接口 | 容器内 25500 端口 |
| sub-web | 一个纯前端页面，帮你拼出上面那条链接 | 容器内 80 端口 |
| 远程配置 | 一份 ini，决定分组和分流规则 | 一个 URL，或者服务器上的文件 |

请求链路是这样的：

```txt
浏览器
  ↓
sub-web（静态页，拼链接）
  ↓
subconverter（/sub 转换接口）
  ↓
机场订阅 / 单节点链接
  ↓
Clash / Surge / sing-box 配置
```

最常踩的坑就藏在这里：**sub-web 只是前端，它自己没有 `/sub` 接口**。所以「后端地址」永远填 subconverter 的地址，不是你在浏览器里打开的那个页面地址。

## 二、准备工作

### 1. 机器

1 核 1G 就能跑，两个容器空载加起来一百多兆内存；镜像本身两百兆上下。我用的是 2 核 1.7G 的 Debian 13，装完还剩一大半。

### 2. 系统与 Docker

```bash
apt update && apt upgrade -y
apt install -y curl ca-certificates gnupg
```

装 Docker 有两条路，先试官方源：

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

如果 `apt update` 对新 codename（比如 trixie）报 404，说明官方源还没跟上，用发行版自带的就行：

```bash
apt install -y docker.io
```

这样装出来的版本也能用，只是后面把 `docker compose` 换成一条条 `docker run`。

验证：

```bash
docker --version
systemctl enable --now docker
```

### 3. 建目录

```bash
mkdir -p /opt/substack && cd /opt/substack
```

后面所有配置都放在这里，备份的时候打包一个目录就够。

### 4. 域名与证书（可选，但强烈建议）

- 给个二级域名，比如 `sub.example.com`，A 记录指向这台机器；
- 云厂商安全组放行 80/443；
- 国内机器必须先备案，否则 80/443 上的域名请求会被拦（这事我踩过，见[部署笔记](/posts/deploy-notes/)）。

只想局域网自娱自乐的话，跳过这步，直接用 `http://内网IP:58080` 访问。

## 三、起后端：subconverter

先拉起来看看能不能跑：

```bash
docker run -d --name subconverter --restart always \
  -p 127.0.0.1:25500:25500 \
  tindy2013/subconverter:latest
```

```bash
curl -s http://127.0.0.1:25500/version
# subconverter v0.9.x backend
```

注意 `-p 127.0.0.1:25500:25500`：这里故意把端口只绑在回环地址上，外网访问不到，必须走 Nginx 反代。直接 `-p 25500:25500` 等于把一个无鉴权的转换接口挂在公网上，很快就会被别人的脚本刷满。

### 写一份自己的 pref.ini

新建 `/opt/substack/pref.ini`：

```ini
[common]
; 防止别人通过接口读你机器上的本地文件和订阅
api_mode=true
; 改成一串随机字符，别用示例里的 password
api_access_token=换成32位随机串
; 开缓存，少重复拉订阅
enable_cache=true
cache_subscription=300
cache_config=3600
; 过滤掉机场塞进来的"剩余流量""官网地址"这类假节点
exclude_remarks=(到期|剩余流量|官网|订阅|过期)
log_level=info

[server]
listen=0.0.0.0
port=25500

[advanced]
max_pending_connections=200
max_concurrent_threads=4
```

几条值得说明的：

- `api_mode=true` 之后，读取本地订阅、本地文件这类操作必须带 `&token=`；普通的 `&url=` 转换不受影响。
- `exclude_remarks` 用正则，机场那些「剩余流量」「官网」节点会被剔掉，客户端里就清爽了。
- `max_concurrent_threads` 控制转换并发，1G 内存的机器开到 4 足够，别贪。

改完重建容器，把配置挂进去：

```bash
docker rm -f subconverter
docker run -d --name subconverter --restart always \
  -p 127.0.0.1:25500:25500 \
  -v /opt/substack/pref.ini:/base/pref.ini:ro \
  tindy2013/subconverter:latest
```

> 也可以不挂载，用 `curl -F "data=@pref.ini" "http://127.0.0.1:25500/updateconf?type=form&token=你的token"` 上传。但容器一重建就丢，还是挂载省心。

### 测一次真实转换

拿你自己的订阅链接试。注意 `url` 参数必须做 URL 编码，手工拼很容易漏：

```bash
SUB='https://example.com/api/v1/client/subscribe?token=xxxxxx'
ENC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$SUB")

curl -s "http://127.0.0.1:25500/sub?target=clash&url=$ENC" | head -20
```

输出里能看到 `proxies:`、`proxy-groups:`、`rules:`，就说明链路通了。

如果返回 `No nodes were resolved`，一般是订阅拉不到：链接过期、需要特定 UA、或者机器出不去。可以先单独验一下订阅本身：

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$SUB"
```

## 四、起前端：sub-web

```bash
docker run -d --name subweb --restart always \
  -p 127.0.0.1:58080:80 \
  -e VITE_SUBCONVERTER_DEFAULT_BACKEND=https://sub.example.com \
  careywong/subweb:latest
```

`VITE_SUBCONVERTER_DEFAULT_BACKEND` 就是页面上那个「后端地址」，写裸域名、`/sub`、`/sub?` 都能识别。还没配域名的话，先写成 `http://内网IP:25500` 在局域网里试。

本地先看一眼：

```bash
curl -sI http://127.0.0.1:58080/ | head -1
```

## 五、Nginx 反代 + HTTPS

我推荐**前后端同一个域名**，前端放 `/`，后端放 `/sub`。这样浏览器里是同源请求，完全绕开 CORS 那些麻烦事。

```nginx
# /etc/nginx/sites-available/sub.conf
limit_req_zone $binary_remote_addr zone=subzone:10m rate=2r/s;

server {
    listen 80;
    server_name sub.example.com;

    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    http2 on;
    server_name sub.example.com;

    ssl_certificate     /etc/letsencrypt/live/sub.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sub.example.com/privkey.pem;

    client_max_body_size 2m;

    # 前端静态页
    location / {
        proxy_pass http://127.0.0.1:58080;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 转换接口，单独限流
    location /sub {
        limit_req zone=subzone burst=20 nodelay;
        proxy_pass http://127.0.0.1:25500;
        proxy_read_timeout 30s;
        add_header Cache-Control "no-store";
    }

    location = /version {
        proxy_pass http://127.0.0.1:25500;
    }
}
```

`http2 on;` 是 nginx 1.25.1 之后的新写法，老版本改成 `listen 443 ssl http2;`。

启用并签证书：

```bash
ln -s /etc/nginx/sites-available/sub.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

apt install -y certbot python3-certbot-nginx
certbot --nginx -d sub.example.com
```

> 首次签证书时要先有能用的 80 端口。如果 443 那段还没证书文件，nginx -t 会报错，可以先把 443 的 server 块注释掉，签完再打开。

然后打开 `https://sub.example.com`，后端地址填 `https://sub.example.com`，生成链接试导入。

## 六、加固：别让它变成公共转换站

这套东西一旦裸奔，最可能的结果不是被攻击，而是被当成免费接口刷，跑满你机器的带宽和 CPU。

已经做了三件：

1. **只绑回环**：`-p 127.0.0.1:25500:25500`，外网碰不到后端；
2. **api_mode + token**：本地文件类接口需要凭据；
3. **limit_req 限流**：2 r/s，突发 20。

还可以再加两件：

```nginx
# 只放行自己的常用出口（可选，手机换网会失效，谨慎）
# location /sub {
#     allow 1.2.3.4;
#     deny all;
# }
```

- 把 `/updateconf`、`/getprofile` 这类接口也纳入白名单，或者干脆不在公网暴露；
- 用 `docker logs --tail 200 subconverter` 时不时看一眼访问日志，有没有陌生 IP 在刷。

不建议给 `/sub` 加 Basic 认证：客户端订阅时带凭据很别扭，限流加 token 已经够挡住绝大多数顺手白嫖。

## 七、验收清单

搭完按这五条过一遍，都绿了才算真的可用：

- 访问 `https://sub.example.com/version`，返回里带 `backend`
- 页面上生成一条 Clash 链接，客户端能正常导入
- 客户端更新订阅不报错
- 换一份远程配置（分组、规则）后，生成结果跟着变
- 手机切到移动网络后订阅仍能更新（确认没有误伤 IP 白名单）

## 八、踩坑记录

1. **生成的链接 404**。八成是「后端地址」填成了前端页面地址。sub-web 自己不带 `/sub`，填它当然 404。
2. **浏览器控制台报 CORS**。前后端放在两个不同子域，浏览器就会拦。要么同域用 `/sub` 反代（本文做法），要么确认后端响应头里带了 `Access-Control-Allow-Origin`。
3. **`No nodes were resolved`**。订阅本身拉不到：链接过期、机场要求特定 UA，或者机器到机场的路不通。先用 `curl` 直接拉订阅验证。
4. **拉远程配置 / 规则集超时**。很多示例配置放在 GitHub raw 上，国内不稳。把 ini 存到本机，`&config=` 改成服务器路径，或者换成国内镜像。
5. **短链接那一栏用不了**。sub-web 的短链依赖外部 myurls 服务，不是自带的。不想折腾就忽略，用长链接；或者用 subconverter 的配置档案 `/getprofile?name=...&token=...` 把长参数收进一个文件。
6. **节点名里 emoji 乱码**。链接参数要 URL 编码（`|` 要编成 `%7C`）。sub-web 已经处理了，手拼链接才会出问题。
7. **内存慢慢涨**。把 `max_pending_connections` 和 `max_concurrent_threads` 调小，或者给容器加 `--memory=256m`。
8. **怎么更新**。`docker pull` 拉新镜像，`docker rm -f subconverter subweb` 删旧容器，再把上面两条 `docker run` 重执行一遍；用 compose 则是 `docker compose pull && docker compose up -d`。

## 九、一句话总结

接口只绑本机，外面套一层 HTTPS 和限流，链接里带 token——做到这三件，它才算是「你自己的」转换服务，而不是又一个挂在公网上的免费接口。
