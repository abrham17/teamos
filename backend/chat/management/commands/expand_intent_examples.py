from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from chat.models import IntentClassificationLog

class Command(BaseCommand):
    help = "Review LLM-classified messages and promote good ones to the static example set"
    
    def handle(self, *args, **options):
        # Pull recent LLM-classified messages with high confidence
        recent = IntentClassificationLog.objects.filter(
            layer_used=3,
            intent_confidence__gte=0.88,
            created_at__gte=timezone.now() - timedelta(days=7)
        ).order_by("-intent_confidence")[:50]
        
        self.stdout.write(f"Found {len(recent)} high-confidence LLM classifications from last 7 days")
        self.stdout.write("Review and add to INTENT_EXAMPLES in chat/intent/examples.py")
        
        for log in recent:
            self.stdout.write("\n---")
            self.stdout.write(f"Message: {log.message}")
            self.stdout.write(f"Intent: {log.intent_type} (complexity: {log.complexity})")
            self.stdout.write(f"Capabilities: {log.required_capabilities}")
            self.stdout.write(f"Confidence: {log.intent_confidence:.2f}")
            # Format as a dictionary entry for easy copy-pasting
            self.stdout.write("Copy-paste dictionary entry:")
            entry = (
                f'    {{\n'
                f'        "message": "{log.message}",\n'
                f'        "intent": IntentSchema(\n'
                f'            intent_type="{log.intent_type}", complexity="{log.complexity}",\n'
                f'            domains={log.domains}, required_capabilities={log.required_capabilities},\n'
                f'            parallelizable=False, estimated_rounds=4, requires_external=False\n'
                f'        )\n'
                f'    }},'
            )
            self.stdout.write(entry)
