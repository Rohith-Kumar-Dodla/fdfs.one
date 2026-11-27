import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { reportReasons, reviewTargets } from '../../../../shared/reviews.js';
import { genres, languages } from '../../../../shared/films.js';
import { reviewGenres } from '../../../../shared/reviews.js';
import { professions } from '../../../../shared/talent.js';

const { Schema } = mongoose;
const oid = Schema.Types.ObjectId;
const timestamps = { timestamps: true, bufferCommands: false };
const publicId = {
  type: String,
  default: randomUUID,
  unique: true,
  immutable: true,
  required: true,
};
const targetType = {
  type: String,
  enum: reviewTargets,
  immutable: true,
  required: true,
};
const objectRef = (ref) => ({
  type: oid,
  ...(ref && { ref }),
  required: true,
  immutable: true,
});
const target = { targetType, target: objectRef() };
const person = new Schema(
  {
    personality: objectRef('Personality'),
    role: { type: String, enum: Object.keys(professions), required: true },
    character: String,
    department: String,
  },
  { _id: false },
);
const media = { type: oid, ref: 'MediaAsset' };
const movie = new Schema(
  {
    publicId,
    slug: {
      type: String,
      unique: true,
      immutable: true,
      required: true,
      maxlength: 90,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    title: { type: String, required: true, maxlength: 140 },
    titleKey: { type: String, required: true },
    titlePrefixes: [String],
    originalTitle: String,
    synopsis: String,
    description: String,
    releaseDate: Date,
    releaseYear: { type: Number, min: 1888, max: 2100 },
    runtimeMinutes: {
      type: Number,
      min: 1,
      max: 1440,
      validate: Number.isInteger,
    },
    genres: [
      { type: String, enum: Object.keys({ ...genres, ...reviewGenres }) },
    ],
    language: { type: String, enum: Object.keys(languages) },
    languages: [{ type: String, enum: Object.keys(languages) }],
    countries: [String],
    companies: [String],
    advisory: String,
    poster: media,
    backdrop: media,
    gallery: [media],
    trailer: { provider: String, providerVideoId: String, sourceUrl: String },
    artworkAuthorized: Boolean,
    trailerAuthorized: Boolean,
    credits: [person],
    awards: [
      new Schema(
        { title: String, organization: String, year: Number, source: String },
        { _id: false },
      ),
    ],
    links: [new Schema({ label: String, url: String }, { _id: false })],
    metadata: new Schema(
      {
        provider: String,
        id: String,
        attribution: String,
        externalRating: Number,
        scale: Number,
        syncedAt: Date,
        unmatched: [
          new Schema(
            { sourceId: String, name: String, credit: String },
            { _id: false },
          ),
        ],
        images: [String],
      },
      { _id: false },
    ),
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      required: true,
    },
    publishedAt: Date,
    archivedAt: Date,
    createdBy: { type: String, immutable: true, required: true },
    updatedBy: { type: String, required: true },
    engagementFence: { type: Number, select: false },
    ratingRank: { type: Number, default: null },
    ratingCount: { type: Number, default: 0 },
  },
  { ...timestamps, optimisticConcurrency: true },
);
movie.index(
  { 'metadata.provider': 1, 'metadata.id': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'metadata.provider': { $type: 'string' },
      'metadata.id': { $type: 'string' },
    },
  },
);
movie.index({ status: 1, releaseDate: -1, _id: -1 });
movie.index({ status: 1, publishedAt: -1, _id: -1 });
movie.index({ status: 1, titleKey: 1, _id: 1 });
movie.index({ status: 1, titlePrefixes: 1 });
movie.index({ status: 1, genres: 1, releaseYear: -1 });
movie.index({ status: 1, language: 1, releaseYear: -1 });
movie.index({ status: 1, releaseYear: -1 });
movie.index({ status: 1, ratingRank: -1, ratingCount: -1, _id: 1 });
movie.index({ status: 1, ratingCount: -1, _id: 1 });
movie.index({ 'credits.personality': 1, status: 1, releaseDate: -1 });
const currentAuthor = objectRef('User');
const rating = new Schema(
  {
    ...target,
    author: currentAuthor,
    units: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
      validate: Number.isInteger,
    },
    excludedAt: Date,
  },
  timestamps,
);
rating.index({ targetType: 1, target: 1, author: 1 }, { unique: true });
rating.index({ author: 1 });
rating.index({ author: 1, updatedAt: -1, _id: -1 });
const totals = new Schema(
  { ...target, count: Number, sum: Number, distribution: [Number] },
  { bufferCommands: false },
);
totals.index({ targetType: 1, target: 1 }, { unique: true });
const moderation = {
  status: {
    type: String,
    enum: ['published', 'hidden', 'deleted'],
    default: 'published',
    required: true,
  },
  moderationReason: { type: String, select: false },
  moderatedBy: { type: String, select: false },
  moderatedAt: Date,
  editedAt: Date,
};
const review = new Schema(
  {
    publicId,
    ...target,
    author: currentAuthor,
    title: String,
    body: { type: String, required: true, maxlength: 6000 },
    spoiler: { type: Boolean, default: false },
    ...moderation,
    likeCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
  },
  timestamps,
);
review.index(
  { targetType: 1, target: 1, author: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['published', 'hidden'] } },
  },
);
review.index({ targetType: 1, target: 1, status: 1, createdAt: -1, _id: -1 });
review.index({ targetType: 1, target: 1, status: 1, likeCount: -1, _id: -1 });
review.index({ author: 1, status: 1 });
review.index({ author: 1, updatedAt: -1, _id: -1 });
review.index({ status: 1, createdAt: -1, _id: -1 });
review.index({ status: 1, spoiler: 1, title: 1, _id: 1 });
const like = new Schema(
  { review: objectRef('Review'), author: currentAuthor },
  timestamps,
);
like.index({ review: 1, author: 1 }, { unique: true });
like.index({ review: 1, createdAt: -1 });
const comment = new Schema(
  {
    publicId,
    review: objectRef('Review'),
    author: currentAuthor,
    body: { type: String, required: true, maxlength: 2000 },
    spoiler: { type: Boolean, default: false },
    ...moderation,
  },
  timestamps,
);
comment.index({ review: 1, status: 1, createdAt: -1, _id: -1 });
const report = new Schema(
  {
    publicId,
    subjectType: {
      type: String,
      enum: ['review', 'comment'],
      required: true,
      immutable: true,
    },
    subject: objectRef(),
    review: objectRef('Review'),
    reporter: objectRef('User'),
    reason: { type: String, enum: reportReasons, required: true },
    details: String,
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    resolution: String,
    resolvedBy: String,
    resolvedAt: Date,
  },
  timestamps,
);
report.index({ subjectType: 1, subject: 1, reporter: 1 }, { unique: true });
report.index({ status: 1, createdAt: -1, _id: -1 });
export const Movie = mongoose.model('Movie', movie);
export const Rating = mongoose.model('ReviewRating', rating);
export const RatingTotals = mongoose.model('ReviewRatingTotals', totals);
export const Review = mongoose.model('Review', review);
export const ReviewLike = mongoose.model('ReviewLike', like);
export const ReviewComment = mongoose.model('ReviewComment', comment);
export const ReviewReport = mongoose.model('ReviewReport', report);
export const initializeReviewsIndexes = () =>
  Promise.all(
    [
      Movie,
      Rating,
      RatingTotals,
      Review,
      ReviewLike,
      ReviewComment,
      ReviewReport,
    ].map((model) => model.createIndexes()),
  );
