FROM rasa/rasa:3.6.2
WORKDIR /app
COPY . /app
RUN rasa train
RUN chmod +x start.sh
CMD ["./start.sh"]