import os
from io import BytesIO
from django.core.files.storage import Storage
from django.core.files.base import ContentFile
from django.utils.deconstruct import deconstructible
from appwrite.client import Client
from appwrite.services.storage import Storage as AppwriteStorageService
from appwrite.input_file import InputFile

@deconstructible
class AppwriteMediaStorage(Storage):
    def __init__(self):
        self.client = Client()
        self.client.set_endpoint(os.environ.get("APPWRITE_ENDPOINT"))
        self.client.set_project(os.environ.get("APPWRITE_PROJECT_ID"))
        self.client.set_key(os.environ.get("APPWRITE_API_KEY"))
        
        self.storage_service = AppwriteStorageService(self.client)
        self.bucket_id = os.environ.get("APPWRITE_BUCKET_ID", "default")

    def _open(self, name, mode='rb'):
        # Appwrite doesn't support random access easily; we download the whole file
        try:
            result = self.storage_service.get_file_download(self.bucket_id, name)
            return ContentFile(result)
        except Exception:
            return None

    def _save(self, name, content):
        # Generate a unique file ID (or use name as ID if compatible)
        # We'll use the 'unique()' helper or the name itself
        file_id = name.replace("/", "_") # Appwrite IDs don't like slashes
        
        # Read content into memory
        content_bytes = content.read()
        input_file = InputFile.from_bytes(content_bytes, filename=name)
        
        try:
            self.storage_service.create_file(
                bucket_id=self.bucket_id,
                file_id=file_id,
                file=input_file
            )
            return file_id
        except Exception as e:
            # If file already exists, we might want to update or error
            raise e

    def exists(self, name):
        try:
            self.storage_service.get_file(self.bucket_id, name.replace("/", "_"))
            return True
        except Exception:
            return False

    def url(self, name):
        # Returns the public download/preview URL
        return f"{os.environ.get('APPWRITE_ENDPOINT')}/storage/buckets/{self.bucket_id}/files/{name.replace('/', '_')}/view?project={os.environ.get('APPWRITE_PROJECT_ID')}"

    def delete(self, name):
        try:
            self.storage_service.delete_file(self.bucket_id, name.replace("/", "_"))
        except Exception:
            pass

    def size(self, name):
        file_info = self.storage_service.get_file(self.bucket_id, name.replace("/", "_"))
        return file_info.get('sizeOriginal', 0)
