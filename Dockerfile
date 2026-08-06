# 内容增长引擎（公众号 + 小红书）—— 全栈自包含镜像
FROM node:20-alpine

WORKDIR /app

# better-sqlite3 需要编译工具链
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
# 数据落盘 /app/data（可挂卷持久化）：docker run -v engine-data:/app/data ...
EXPOSE 8787

CMD ["npm", "start"]
