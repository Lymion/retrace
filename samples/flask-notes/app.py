from flask import Flask

from config import Config
from db import init_db
from notes.routes import bp


def create_app(config=Config):
    app = Flask(__name__)
    app.config.from_object(config)
    init_db(app)
    app.register_blueprint(bp)
    return app


if __name__ == "__main__":
    create_app().run(debug=True)
