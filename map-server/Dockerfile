FROM maptiler/tileserver-gl:latest

COPY config.json /data/config.json
COPY styles /data/styles

EXPOSE 8080

CMD ["--config", "config.json", "--port", "8080"]
