FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node frontend/package.json frontend/serve.js frontend/index.html frontend/app.js frontend/style.css ./
USER node
ENV HOST=0.0.0.0 PORT=5173 BACKEND_URL=http://backend:3001
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:5173/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "serve.js"]
