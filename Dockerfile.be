FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

# Install deps first (cache layer)
COPY package*.json ./
RUN npm install --omit=dev

# Copy source
COPY . .

EXPOSE 3001

CMD xvfb-run --server-args="-screen 0 1280x800x24" node index.js
