FROM node:current-slim

COPY dist/server.js /

CMD node /server.js
EXPOSE 58888/tcp
