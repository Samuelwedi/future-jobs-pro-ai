FROM rasa/rasa:3.6.2
WORKDIR /app
COPY . /app
RUN pip install -r requirements.txt
CMD ["rasa", "run", "--enable-api", "--port", "5005"]