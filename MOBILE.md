# Mobile

Plan React Native with Expo in the reserved `mobile/` directory. The app will use the centralized `/api/v1` REST API and share the web client's response contracts, public identifiers, pagination rules and UTC timestamp format. Authentication and media capabilities will follow the shared API as they are implemented.

Mobile development begins in Phase 9.1. The `shared/` directory is reserved for later cross-client code.

Reuse bearer access tokens and the account and session response contracts. Keep access tokens in memory and store future native refresh credentials in Expo SecureStore. Native session issuance and refresh need a dedicated credential transport with an explicit server contract. The browser refresh endpoints require a cookie, trusted origin and CSRF header. Native support must preserve those protections.

The shared API now exposes verified account profile images and an owner-scoped submission workflow using bearer authentication. Native uploads should send raw JPEG, PNG or WebP bytes using the declared image MIME. Image reads return HTTPS variants and dimensions for responsive rendering. Use the shared video provider identifier, availability and playback type to select a supported YouTube embed in the future native client. Preserve player controls, provider restrictions and the required client-origin identification in any WebView integration.
