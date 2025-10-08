FROM node:latest AS build
WORKDIR /app
COPY package*.json ./

RUN npm ci

RUN npm install -g @angular/cli@latest

COPY . .

RUN npm install
RUN ng build

FROM nginx:latest
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/timer-app/browser /usr/share/nginx/html

EXPOSE 80