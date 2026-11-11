FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN python3 -m venv /opt/parser && /opt/parser/bin/pip install --no-cache-dir -r requirements.txt
COPY --chown=node:node backend/package.json ./
COPY --chown=node:node backend/src ./src
COPY --chown=node:node backend/scripts ./scripts
COPY --chown=node:node backend/fixtures ./fixtures
RUN mkdir -p /app/data /app/backend/var && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=3001 PYTHON_BIN=/opt/parser/bin/python DB_PATH=/app/backend/var/signall.sqlite
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
