# Mobile

Plan React Native with Expo in the reserved `mobile/` directory. The app will use the centralized `/api/v1` REST API and share the web client's response contracts, public identifiers, pagination rules and UTC timestamp format. Authentication and media capabilities will follow the shared API as they are implemented.

Mobile development begins in Phase 9.1. The `shared/` directory is reserved for later cross-client code.

Reuse bearer access tokens and the account and session response contracts. Keep access tokens in memory and store future native refresh credentials in Expo SecureStore. Native session issuance and refresh need a dedicated credential transport with an explicit server contract. The browser refresh endpoints require a cookie, trusted origin and CSRF header. Native support must preserve those protections.
