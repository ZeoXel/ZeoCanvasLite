# 代理环境下的开发配置

## 问题描述
开启梯子（VPN/代理）后，无法访问 `localhost:3000`，因为代理软件拦截了本地请求。

## 解决方案

### 方案 1：使用无代理启动脚本（推荐）

直接运行：
```bash
bun run dev:noproxy
```

这个命令会自动忽略系统代理设置，确保本地开发服务器正常访问。

### 方案 2：配置代理软件绕过本地地址

#### Clash 配置
编辑 Clash 配置文件，在 `rules` 部分添加：
```yaml
rules:
  - DOMAIN-SUFFIX,localhost,DIRECT
  - IP-CIDR,127.0.0.0/8,DIRECT
  - IP-CIDR,192.168.0.0/16,DIRECT
```

#### V2Ray/V2RayN 配置
1. 打开设置 → 路由设置
2. 添加规则：
   - 域名：`localhost,127.0.0.1`
   - 出站：`direct`

#### Surge 配置
在配置文件中添加：
```
[Rule]
DOMAIN-SUFFIX,localhost,DIRECT
IP-CIDR,127.0.0.0/8,DIRECT
```

#### ClashX Pro 配置
1. 配置 → 规则模式 → 规则
2. 添加：`DOMAIN,localhost,DIRECT`

### 方案 3：临时关闭代理
开发时临时关闭系统代理，完成后再开启。

## 用户访问说明

如果你的用户也遇到此问题，建议他们：

1. **浏览器设置代理例外**
   - Chrome/Edge：设置 → 系统 → 代理设置 → 例外列表添加 `localhost,127.0.0.1`
   - Firefox：设置 → 网络设置 → 不使用代理：`localhost, 127.0.0.1`

2. **使用 127.0.0.1 代替 localhost**
   直接访问 `http://127.0.0.1:3000` 而不是 `http://localhost:3000`

3. **配置代理软件**
   按照上述方案 2 配置代理软件绕过本地地址

## 验证方法

运行以下命令检查代理设置：
```bash
echo $HTTP_PROXY
echo $HTTPS_PROXY
echo $NO_PROXY
```

如果显示为空或包含 localhost，说明配置正确。
