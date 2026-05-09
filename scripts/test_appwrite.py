import os
import django
from django.core.files.base import ContentFile
from django.conf import settings

# Setup Django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "teamos_project.settings.production")
django.setup()

from wiki.models import WikiPage
from accounts.models import Team

def test_appwrite_upload():
    print("--- Starting Appwrite Storage Test ---")
    
    # Get a test team
    team = Team.objects.first()
    if not team:
        print("Error: No team found in database to attach the file to.")
        return

    # Create a dummy file
    filename = "appwrite_test_doc.txt"
    content = b"This is a test document to verify Appwrite Storage integration on TeamOS."
    file_obj = ContentFile(content, name=filename)

    print(f"Uploading {filename} to Appwrite bucket: {os.environ.get('APPWRITE_BUCKET_ID')}...")
    
    try:
        # Create a WikiPage and save the file
        page = WikiPage.objects.create(
            team=team,
            title="Appwrite Test Document",
            slug=f"appwrite-test-{os.urandom(4).hex()}",
            content="Testing storage backend..."
        )
        
        # We manually use the storage to verify it works
        from django.core.files.storage import default_storage
        path = default_storage.save(f"test_uploads/{filename}", file_obj)
        url = default_storage.url(path)
        
        print(f"SUCCESS! File saved at: {path}")
        print(f"Appwrite URL: {url}")
        
        # Cleanup (Optional: delete the test page)
        # page.delete()
        
    except Exception as e:
        print(f"FAILED: {str(e)}")

if __name__ == "__main__":
    test_appwrite_upload()
