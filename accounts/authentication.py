import os
from typing import Optional, Tuple
from urllib.parse import urlparse

import jwt
from django.contrib.auth import get_user_model
from django.conf import settings
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication

User = get_user_model()


class ClerkJWTAuthentication(BaseAuthentication):
    """
    Validates Clerk Bearer tokens against Clerk JWKS and maps identity
    to local Django users through clerk_user_id.
    """

    def authenticate(self, request) -> Optional[Tuple[User, None]]:
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return None

        token = header.replace("Bearer ", "", 1).strip()
        if not token:
            return None

        payload = self._verify_token(token)
        clerk_user_id = payload.get("sub")
        if not clerk_user_id:
            raise exceptions.AuthenticationFailed("Invalid Clerk token payload.")

        email = (payload.get("email") or "").lower()
        first_name = payload.get("given_name", "")
        last_name = payload.get("family_name", "")
        avatar_url = payload.get("picture", "")

        user, _created = User.objects.get_or_create(
            clerk_user_id=clerk_user_id,
            defaults={
                "username": email or f"clerk_{clerk_user_id}",
                "email": email or f"{clerk_user_id}@clerk.local",
                "first_name": first_name,
                "last_name": last_name,
                "avatar_url": avatar_url,
            },
        )

        updated = False
        if email and user.email != email:
            user.email = email
            user.username = email
            updated = True
        if first_name and user.first_name != first_name:
            user.first_name = first_name
            updated = True
        if last_name and user.last_name != last_name:
            user.last_name = last_name
            updated = True
        if avatar_url and user.avatar_url != avatar_url:
            user.avatar_url = avatar_url
            updated = True
        if updated:
            user.save(update_fields=["email", "username", "first_name", "last_name", "avatar_url"])

        return user, None

    def _verify_token(self, token: str) -> dict:
        jwks_url = os.environ.get("CLERK_JWKS_URL")
        issuer = os.environ.get("CLERK_ISSUER")
        audience = os.environ.get("CLERK_AUDIENCE")

        if not jwks_url or not issuer:
            issuer, jwks_url = self._derive_issuer_and_jwks_from_token(token)

        if not jwks_url or not issuer:
            raise exceptions.AuthenticationFailed("Clerk is not configured on the backend.")

        try:
            jwk_client = jwt.PyJWKClient(jwks_url)
            signing_key = jwk_client.get_signing_key_from_jwt(token)
            options = {"verify_aud": bool(audience)}
            kwargs = {
                "algorithms": ["RS256"],
                "issuer": issuer,
                "options": options,
            }
            if audience:
                kwargs["audience"] = audience
            return jwt.decode(token, signing_key.key, **kwargs)
        except jwt.PyJWTError as exc:
            raise exceptions.AuthenticationFailed(f"Invalid Clerk token: {exc}") from exc

    def _derive_issuer_and_jwks_from_token(self, token: str) -> Tuple[str, str]:
        """
        Dev-friendly fallback:
        when explicit Clerk env vars are absent, derive issuer from token.
        """
        try:
            payload = jwt.decode(
                token,
                options={
                    "verify_signature": False,
                    "verify_exp": False,
                    "verify_aud": False,
                    "verify_iss": False,
                },
                algorithms=["RS256"],
            )
        except jwt.PyJWTError:
            return "", ""

        issuer = str(payload.get("iss") or "").strip()
        if not issuer:
            return "", ""

        parsed = urlparse(issuer)
        if parsed.scheme != "https":
            return "", ""

        host = (parsed.hostname or "").lower()
        if not (host.endswith(".clerk.accounts.dev") or host.endswith(".clerk.com")):
            return "", ""

        return issuer, f"{issuer.rstrip('/')}/.well-known/jwks.json"

class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        header = self.get_header(request)
        
        # Fallback to reading token from HTTP headers if no cookie found (useful for APIs)
        if header is not None:
            raw_token = self.get_raw_token(header)
        else:
            # Read token from cookies
            raw_token = request.COOKIES.get(settings.SIMPLE_JWT['AUTH_COOKIE']) or None
            
        if raw_token is None:
            return None

        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token
