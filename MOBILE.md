# Mobile

Plan React Native with Expo in the reserved `mobile/` directory. The app will use the centralized `/api/v1` REST API and share the web client's response contracts, public identifiers, pagination rules and UTC timestamp format. Authentication and media capabilities will follow the shared API as they are implemented.

Mobile development begins in Phase 9.1. The `shared/` directory is reserved for later cross-client code.

Reuse bearer access tokens and the account and session response contracts. Keep access tokens in memory and store future native refresh credentials in Expo SecureStore. Native session issuance and refresh need a dedicated credential transport with an explicit server contract. The browser refresh endpoints require a cookie, trusted origin and CSRF header. Native support must preserve those protections.

The shared API now exposes verified account profile images and an owner-scoped submission workflow using bearer authentication. Native uploads should send raw JPEG, PNG or WebP bytes using the declared image MIME. Image reads return HTTPS variants and dimensions for responsive rendering. Use the shared video provider identifier, availability and playback type to select a supported YouTube embed in the future native client. Preserve player controls, provider restrictions and the required client-origin identification in any WebView integration.

Talent Profiles use `GET /api/v1/talent` for paginated published records and `GET /api/v1/talent/:slug` for details. Use the stable public ID to identify a personality and its slug for links. Display the API's HTTPS portrait and cover variants with a neutral placeholder when an image is unavailable. Filmography and podcast appearances will follow published relationship records from their owning modules. Verified proposal uploads use the shared image upload requirements and bearer authentication.

Cinema and Originals use the shared `/api/v1/films` directory and slug detail contract. Set the classification for the corresponding native section and follow server-provided release availability. Released videos use the YouTube provider identifier and official embeddable playback, with provider controls and a user-initiated start. Upcoming announcements may expose a trailer. The API provides responsive Cloudinary images, public talent identifiers and the correct classification for detail and filmography links.
