export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { searchType, latitude, longitude } = req.body;

    if (!searchType || !latitude || !longitude) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method:  'POST',
            headers: {
                'Content-Type':     'application/json',
                'X-Goog-Api-Key':   process.env.GOOGLE_MAPS_API_KEY,
                'X-Goog-FieldMask': 'places.formattedAddress,places.displayName,places.location,places.rating,places.userRatingCount',
            },
            body: JSON.stringify({
                textQuery:    searchType,
                languageCode: 'ja',
                locationBias: {
                    circle: {
                        center: { latitude, longitude },
                        radius: 3000,
                    },
                },
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error: data?.error?.message ?? 'Places API error'
            });
        }

        return res.status(200).json({ places: data.places ?? [] });

    } catch (e) {
        console.error('Places proxy error:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}