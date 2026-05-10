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

    def _get_file_id(self, name):
        # If name is already a 32-char hex string (our MD5 hash), don't hash it again
        import re
        # Check if it looks like an MD5 hash
        if isinstance(name, str) and re.match(r'^[a-f0-9]{32}$', name):
            return name
            
        import hashlib
        # We use MD5 of the name to create a valid Appwrite File ID
        return hashlib.md5(str(name).encode()).hexdigest()

    def _open(self, name, mode='rb'):
        # Appwrite doesn't support random access easily; we download the whole file
        try:
            file_id = self._get_file_id(name)
            result = self.storage_service.get_file_download(self.bucket_id, file_id)
            return ContentFile(result)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Appwrite storage error: Failed to download file {name} (ID: {file_id}) from bucket {self.bucket_id}: {e}")
            return None

    def _save(self, name, content):
        file_id = self._get_file_id(name)
        
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
            file_id = self._get_file_id(name)
            self.storage_service.get_file(self.bucket_id, file_id)
            return True
        except Exception:
            return False

    def url(self, name):
        # Returns the public download/preview URL
        file_id = self._get_file_id(name)
        return f"{os.environ.get('APPWRITE_ENDPOINT')}/storage/buckets/{self.bucket_id}/files/{file_id}/view?project={os.environ.get('APPWRITE_PROJECT_ID')}"

    def delete(self, name):
        try:
            file_id = self._get_file_id(name)
            self.storage_service.delete_file(self.bucket_id, file_id)
        except Exception:
            pass

    def size(self, name):
        file_id = self._get_file_id(name)
        file_info = self.storage_service.get_file(self.bucket_id, file_id)
        return file_info.get('sizeOriginal', 0)
