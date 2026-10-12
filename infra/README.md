# 本地基础设施

本目录提供开发环境需要的 PostgreSQL 与 Redis。全部端口只绑定到 `127.0.0.1`；数据库卷由 Docker 管理，默认不会公开到局域网或互联网。媒体对象存储使用仓库外部的阿里云 OSS 私有 Bucket，不作为 Docker 服务运行。

Compose 中的 `docker.m.daocloud.io` 和 `quay.m.daocloud.io` 前缀仅用于本地开发网络兼容。生产部署必须改用经组织批准、可审计且有镜像固定策略的受控镜像仓库，不能依赖公共镜像代理。

## 启动

在仓库根目录创建本机环境文件。示例值只能用于本机开发，首次启动前应替换为随机值，不能提交该文件。

```powershell
Copy-Item .env.example .env
docker compose --env-file .env -f infra/compose.yaml up -d
docker compose --env-file .env -f infra/compose.yaml ps
```

`postgres` 和 `redis` 均应显示为 `healthy`。

## 阿里云 OSS

创建私有 Bucket 和仅有该 Bucket 必要读写权限的 RAM 用户后，将 Bucket、地域、Endpoint 和该 RAM 用户的 AccessKey 填入未提交的 `.env`。不得使用阿里云主账号 AccessKey，不得关闭阻止公共访问，也不得将 Bucket 改为公共读。

OSS 适配器会在后续批次通过服务端生成短时签名 URL；浏览器和生成供应商都不能获得 AccessKey。配置完成前，不提交真实生成任务或媒体上传。

## 数据库迁移

`.env` 中的 `DATABASE_URL` 用于 Drizzle 执行迁移。示例值连接本机 Compose 暴露的 PostgreSQL；更新 `POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD` 或端口时，必须同步更新该连接串。它不能提交到 Git。

在 PostgreSQL healthy 后，从仓库根目录执行：

```powershell
$env:DATABASE_URL = (Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=' } | ForEach-Object { $_ -replace '^DATABASE_URL=', '' })
pnpm --filter @ai-manju/db db:migrate
```

该命令只按 `packages/db/drizzle` 的 journal 顺序应用未执行迁移；不要手工执行其中单个 SQL 文件，否则 journal 与数据库状态会漂移。

## 停止与数据

```powershell
docker compose --env-file .env -f infra/compose.yaml down
```

该命令保留命名卷。开发数据需要重置时，先确认没有需要保留的内容，再执行：

```powershell
docker compose --env-file .env -f infra/compose.yaml down --volumes
```

应用容器应通过 Docker 网络中的服务名 `postgres`、`redis` 连接本地服务。OSS 凭据仅由服务端进程从环境变量读取，不应写入代码、日志或 Git。
