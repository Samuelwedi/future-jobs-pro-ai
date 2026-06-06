FROM rasa/rasa:3.6.2
WORKDIR /app
COPY . /app
RUN rasa train
CMD ["rasa", "run", "--enable-api", "--port", "5005"]