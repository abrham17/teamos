import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)

class PlannerConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.team_id = self.scope['url_route']['kwargs']['team_id']
        self.project_id = self.scope['url_route']['kwargs']['project_id']
        
        self.room_group_name = f"planner_{self.team_id}_{self.project_id}"

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        data = json.loads(text_data)
        event_type = data.get('type')
        
        if event_type == 'cursor_move':
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'planner_message',
                    'message': {
                        'type': 'cursor_move',
                        'userId': data.get('userId'),
                        'x': data.get('x'),
                        'y': data.get('y'),
                        'color': data.get('color', '#6366f1'),
                        'name': data.get('name', 'Anonymous')
                    }
                }
            )
        elif event_type == 'node_move':
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'planner_message',
                    'message': {
                        'type': 'node_move',
                        'userId': data.get('userId'),
                        'nodeId': data.get('nodeId'),
                        'position': data.get('position')
                    }
                }
            )
        elif event_type == 'canvas_sync':
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'planner_message',
                    'message': {
                        'type': 'canvas_update',
                        'userId': data.get('userId'),
                        'nodes': data.get('nodes'),
                        'edges': data.get('edges'),
                        'viewport': data.get('viewport'),
                    }
                }
            )

    async def planner_message(self, event):
        message = event['message']
        await self.send(text_data=json.dumps(message))
