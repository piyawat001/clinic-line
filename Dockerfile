FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# ลบข้อมูลที่ไม่จำเป็น
RUN rm -rf node_modules/.cache

# สร้าง .env ไฟล์จากค่า environment variables
RUN echo "PORT=${PORT:-5001}" > .env && \
    echo "MONGO_URI=${MONGO_URI:-mongodb://mongo:27017/booking-system}" >> .env && \
    echo "JWT_SECRET=${JWT_SECRET:-test}" >> .env && \
    echo "LINE_CHANNEL_ID=${LINE_CHANNEL_ID:-Uf46ba653d06143390bfbc228acc2242f}" >> .env && \
    echo "LINE_CHANNEL_SECRET=${LINE_CHANNEL_SECRET:-a45367f9c01ac2d8417607afed1026e8}" >> .env && \
    echo "LINE_NOTIFY_TOKEN=${LINE_NOTIFY_TOKEN:-bSIb3rMzr1WCjS3NN8H4qGX4egD3m69o8gOXhqTyINigOSv+Unn92bMEQU/d3NXjr5pBIVF4mavgHNPTgRYcRFfbe9xhMz1N/9pQjI6elwrnIFuJI9dCaao4TBBbxzCM9x9MvnUc/1MaBRp/3aDaIgdB04t89/1O/w1cDnyilFU=}" >> .env

EXPOSE 5001

CMD ["npm", "start"]