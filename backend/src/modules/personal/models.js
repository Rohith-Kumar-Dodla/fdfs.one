import mongoose from 'mongoose';
import { saveTypes, progressTypes } from '../../../../shared/personal.js';

const { Schema } = mongoose;
const owner = { type: Schema.Types.ObjectId, ref: 'User', required: true };
const options = { timestamps: true, bufferCommands: false, versionKey: false };
const identity = (types) => ({
  owner,
  module: { type: String, enum: types, required: true },
  target: { type: String, required: true },
});
const saved = new Schema(identity(saveTypes), options);
const playback = new Schema(
  {
    ...identity(progressTypes),
    source: { type: String, required: true },
    position: Number,
    duration: Number,
    revision: Number,
    completed: Boolean,
    dismissed: Boolean,
    watchedAt: Date,
  },
  options,
);
const following = new Schema(
  { owner, talent: { type: String, required: true } },
  options,
);
const preferences = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, ref: 'User' },
    genres: [String],
    types: [String],
    recommendations: { type: Boolean, default: false },
    history: { type: Boolean, default: false },
    talentNotices: { type: Boolean, default: false },
    historyEpoch: { type: String, default: 'initial' },
    serial: { type: Number, default: 0 },
  },
  options,
);
for (const model of [saved, playback]) {
  model.index({ owner: 1, module: 1, target: 1 }, { unique: true });
  const stamp = model === saved ? 'createdAt' : 'watchedAt';
  model.index({ owner: 1, [stamp]: -1, _id: -1 });
  model.index({ owner: 1, module: 1, [stamp]: -1, _id: -1 });
}
playback.index({ owner: 1, completed: 1, dismissed: 1, watchedAt: -1 });
following.index({ owner: 1, talent: 1 }, { unique: true });
following.index({ owner: 1, createdAt: -1, _id: -1 });
preferences.index({ talentNotices: 1, _id: 1 });
export const Watchlist = mongoose.model('Watchlist', saved);
export const Playback = mongoose.model('PlaybackProgress', playback);
export const Following = mongoose.model('TalentFollowing', following);
export const Preferences = mongoose.model('PersonalPreferences', preferences);
export const initializePersonalIndexes = () =>
  Promise.all(
    [Watchlist, Playback, Following, Preferences].map((model) =>
      model.createIndexes(),
    ),
  );
