if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}

const mongoose = require("mongoose");
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const initData = require("./data.js");
const Listing = require("../models/listing.js");
const User = require("../models/user.js");

const dbUrl = process.env.ATLASDB_URL || "mongodb://127.0.0.1:27017/wanderlust";
const mapToken = process.env.MAP_TOKEN;

if (!mapToken) {
    throw new Error("MAP_TOKEN is required to geocode the sample listings.");
}

const geocodingClient = mbxGeocoding({ accessToken: mapToken });

async function geocodeListing(listing) {
    const response = await geocodingClient
        .forwardGeocode({
            query: `${listing.location}, ${listing.country}`,
            limit: 1,
        })
        .send();

    const feature = response.body.features[0];
    if (!feature) {
        throw new Error(`No Mapbox result for ${listing.location}, ${listing.country}`);
    }

    return {
        ...listing,
        geometry: feature.geometry,
    };
}

async function seedDatabase() {
    await mongoose.connect(dbUrl, { serverSelectionTimeoutMS: 10000 });
    console.log("Connected to MongoDB for seeding");

    const username = process.env.SEED_USERNAME || "demo";
    const email = process.env.SEED_EMAIL || "demo@example.com";
    const password = process.env.SEED_PASSWORD || "ChangeMe123!";

    let owner = await User.findOne({ username });
    if (!owner) {
        owner = await User.register(new User({ username, email }), password);
        console.log(`Created seed user: ${username}`);
    }

    const listings = [];
    for (const sourceListing of initData.data) {
        const geocoded = await geocodeListing(sourceListing);
        listings.push({ ...geocoded, owner: owner._id });
        console.log(`Geocoded: ${sourceListing.location}, ${sourceListing.country}`);
    }

    await Listing.deleteMany({});
    await Listing.insertMany(listings);
    console.log(`Inserted ${listings.length} listings`);
}

seedDatabase()
    .catch((err) => {
        console.error("Database seed failed:", err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.connection.close();
    });
