import { YEAR_VALUE } from "./participants.js";

const GROUP_SIZES = [3, 3, 3, 2];
const GROUP_NAMES = ["Group 1", "Group 2", "Group 3", "Group 4"];

function combinations(items, size) {
  const output = [];
  const walk = (start, path) => {
    if (path.length === size) {
      output.push(path);
      return;
    }
    for (let i = start; i <= items.length - (size - path.length); i++) {
      walk(i + 1, [...path, items[i]]);
    }
  };
  walk(0, []);
  return output;
}

function without(items, chosen) {
  const chosenIds = new Set(chosen.map((item) => item.__id));
  return items.filter((item) => !chosenIds.has(item.__id));
}

function scoreGroup(group) {
  return group.reduce((sum, person) => sum + (YEAR_VALUE[person.year] ?? 1), 0);
}

function countHigherYears(group) {
  return group.filter((p) => ["Year 2", "Year 3", "Year 4"].includes(p.year)).length;
}

function yearDistributionPenalty(groups) {
  const years = ["Foundation", "Year 1", "Year 2", "Year 3", "Year 4"];
  let penalty = 0;
  for (const year of years) {
    const counts = groups.map((g) => g.filter((p) => p.year === year).length);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    penalty += (max - min) * 0.5;
  }
  return penalty;
}

function shuffleCopy(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createBalancedGroups(rawParticipants) {
  if (!rawParticipants || rawParticipants.length === 0) return {};

  const participants = shuffleCopy(rawParticipants).map((p, index) => ({
    ...p,
    __id: `${p.name}-${index}`,
    __score: YEAR_VALUE[p.year] ?? 1
  }));

  if (participants.length !== 11) {
    const sorted = [...participants].sort((a, b) => b.__score - a.__score);
    const fallback = GROUP_NAMES.reduce((acc, name) => ({ ...acc, [name]: [] }), {});
    sorted.forEach((p) => {
      const candidates = GROUP_NAMES.filter((name, idx) => fallback[name].length < GROUP_SIZES[idx]);
      candidates.sort((a, b) => {
        const sizeA = fallback[a].length;
        const sizeB = fallback[b].length;
        const scoreA = scoreGroup(fallback[a]);
        const scoreB = scoreGroup(fallback[b]);
        return sizeA - sizeB || scoreA - scoreB;
      });
      fallback[candidates[0]].push(p);
    });
    return cleanGroups(fallback);
  }

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const topCandidates = [];

  const group4Options = combinations(participants, 2);

  for (const group4 of group4Options) {
    const remainingAfterG4 = without(participants, group4);
    for (const group1 of combinations(remainingAfterG4, 3)) {
      const remainingAfterG1 = without(remainingAfterG4, group1);
      for (const group2 of combinations(remainingAfterG1, 3)) {
        const group3 = without(remainingAfterG1, group2);
        if (group3.length !== 3) continue;

        const groups = [group1, group2, group3, group4];
        const totals = groups.map(scoreGroup);
        const averages = groups.map((g, i) => totals[i] / g.length);
        const meanAvg = averages.reduce((a, b) => a + b, 0) / averages.length;
        const avgVariance = averages.reduce((sum, avg) => sum + Math.pow(avg - meanAvg, 2), 0);
        const firstThreeVariance = averages
          .slice(0, 3)
          .reduce((sum, avg) => sum + Math.pow(avg - averages.slice(0, 3).reduce((a, b) => a + b, 0) / 3, 2), 0);

        const g4Avg = averages[3];
        const firstThreeAvg = averages.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
        const g4CompensationPenalty = g4Avg >= firstThreeAvg ? 0 : (firstThreeAvg - g4Avg) * 12;
        const g4HigherYearCount = countHigherYears(group4);
        const g4HasSeniorAnchor = group4.some((p) => ["Year 3", "Year 4"].includes(p.year));
        const g4HigherYearPenalty = Math.max(0, 2 - g4HigherYearCount) * 4;
        const g4SeniorAnchorPenalty = g4HasSeniorAnchor ? 0 : 5;
        const distributionPenalty = yearDistributionPenalty(groups);

        const score =
          avgVariance * 5 +
          firstThreeVariance * 2 +
          g4CompensationPenalty +
          g4HigherYearPenalty +
          g4SeniorAnchorPenalty +
          distributionPenalty;

        if (score < bestScore - 0.00001) {
          bestScore = score;
          best = groups;
          topCandidates.length = 0;
          topCandidates.push(groups);
        } else if (Math.abs(score - bestScore) < 0.35) {
          topCandidates.push(groups);
        }
      }
    }
  }

  if (topCandidates.length > 0) {
    best = topCandidates[Math.floor(Math.random() * topCandidates.length)];
  }

  const result = {
    "Group 1": best?.[0] ?? [],
    "Group 2": best?.[1] ?? [],
    "Group 3": best?.[2] ?? [],
    "Group 4": best?.[3] ?? []
  };

  return cleanGroups(result);
}

function cleanGroups(groups) {
  return Object.fromEntries(
    Object.entries(groups).map(([name, members]) => [
      name,
      sortMembersByYear(members.map(({ __id, __score, ...person }) => person))
    ])
  );
}

export function sortMembersByYear(members) {
  return [...(members || [])].sort((a, b) => {
    const scoreDiff = (YEAR_VALUE[b.year] ?? 0) - (YEAR_VALUE[a.year] ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return a.name.localeCompare(b.name);
  });
}

export function createAnnouncementText(groups) {
  if (!groups || Object.keys(groups).length === 0) return "";
  return Object.entries(groups)
    .map(([groupName, members]) => {
      const sortedMembers = sortMembersByYear(members);
      const memberText = sortedMembers.map((m) => `${m.name}, ${m.year}`).join(". ");
      return `${groupName} team members. ${memberText}.`;
    })
    .join(" ");
}
