import json
from channels.generic.websocket import AsyncWebsocketConsumer

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

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'presence_message',
                'user': self.user.email,
                'status': 'online',
                'page': None
            }
        )

    async def disconnect(self, close_code):
        if not self.user.is_anonymous:
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'presence_message',
                    'user': self.user.email,
                    'status': 'offline',
                    'page': None
                }
            )
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )

    async def receive(self, text_data):
        data = json.loads(text_data)
        page = data.get('page')
        
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'presence_message',
                'user': self.user.email,
                'status': 'online',
                'page': page
            }
        )

    async def presence_message(self, event):
        await self.send(text_data=json.dumps({
            'type': 'presence_update',
            'user': event['user'],
            'status': event['status'],
            'page': event['page']
        }))
