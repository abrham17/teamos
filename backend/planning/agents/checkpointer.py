import psycopg
from langgraph.checkpoint.postgres import PostgresSaver
from django.conf import settings

def get_checkpointer():
    db = settings.DATABASES["default"]
    
    user = db.get("USER", "postgres")
    password = db.get("PASSWORD", "")
    host = db.get("HOST", "localhost")
    port = db.get("PORT", "5432")
    name = db.get("NAME", "teamos")
    
    if password:
        dsn = f"postgresql://{user}:{password}@{host}:{port}/{name}"
    else:
        dsn = f"postgresql://{user}@{host}:{port}/{name}"
        
    conn = psycopg.connect(conninfo=dsn)
    checkpointer = PostgresSaver(conn)
    checkpointer.setup()  # Creates checkpoint tables if not exist
    return checkpointer
