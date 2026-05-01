import json
from channels.generic.websocket import AsyncWebsocketConsumer
from .presence_state import TeamPresenceManager

class PresenceConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        if self.user.is_anonymous:
            await self.close()
            return

        self.team_id = self.scope['url_route']['kwargs']['team_id']
        self.room_group_name = f'presence_{self.team_id}'

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

        # Initial state update
        TeamPresenceManager.update_presence(self.team_id, self.user.email)

    async def disconnect(self, close_code):
        if not self.user.is_anonymous:
            TeamPresenceManager.remove_presence(self.team_id, self.user.email)
            
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'broadcast_presence',
                    'data': TeamPresenceManager.get_team_presence(self.team_id)
                }
            )
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )

    async def receive(self, text_data):
        data = json.loads(text_data)
        page_slug = data.get('page_slug')
        
        # Update global state
        new_state = TeamPresenceManager.update_presence(self.team_id, self.user.email, page_slug)

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_presence',
                'data': new_state
            }
        )

    async def broadcast_presence(self, event):
        await self.send(text_data=json.dumps({
            'type': 'presence_sync',
            'presence': event['data']
        }))
