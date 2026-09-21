# syntax=docker/dockerfile:1

FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --legacy-peer-deps
COPY tsconfig.json ./
COPY src ./src
CMD ["npm", "start"]
