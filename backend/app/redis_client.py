import redis
from app.config import settings

r = redis.from_url(
    settings.REDIS_URL,
    decode_responses=True,
    socket_connect_timeout=5,
    socket_timeout=5,
)

def get_redis():
    return r

def test_redis_connection():
    try:
        result = r.ping()
        print(f"Ping result: {result}")
        return True
    except Exception as e:
        print(f"Redis connection failed: {e}")
        return False