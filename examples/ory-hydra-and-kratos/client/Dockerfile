FROM node:13.6-alpine

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY ./package*.json ./
RUN npm ci
COPY . .

RUN npm run build

CMD ["npm", "start"]