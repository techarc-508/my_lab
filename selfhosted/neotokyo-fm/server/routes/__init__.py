from flask import Blueprint

auth_bp = Blueprint('auth', __name__, url_prefix='/api')
files_bp = Blueprint('files', __name__, url_prefix='/api')
youtube_bp = Blueprint('youtube', __name__, url_prefix='/api')
radio_bp = Blueprint('radio', __name__, url_prefix='/api')
downloads_bp = Blueprint('downloads', __name__, url_prefix='/api')
playlists_bp = Blueprint('playlists', __name__, url_prefix='/api')
admin_bp = Blueprint('admin', __name__, url_prefix='/api')
subsonic_bp = Blueprint('subsonic', __name__, url_prefix='/api/subsonic')
update_bp = Blueprint('update', __name__, url_prefix='/api')
analytics_bp = Blueprint('analytics', __name__, url_prefix='/api')
podcasts_bp = Blueprint('podcasts', __name__, url_prefix='/api')
oauth_bp = Blueprint('oauth', __name__, url_prefix='/api/oauth')

from . import auth, files, youtube, radio, downloads, playlists, admin, subsonic, update, analytics, podcasts, oauth, trivia
