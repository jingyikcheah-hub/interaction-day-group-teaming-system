import { YEAR_VALUE } from "./participants.js";

const GROUP_SIZES = [3, 3, 3, 2];
const GROUP_NAMES = ["Group 1", "Group 2", "Group 3", "Group 4"];

const YEAR_ORDER = {
  "Year 4": 4,
  "Year 3": 3,
  "Year 2": 2,
  "Year 1": 1,
  Foundation: 0
};

function getYearRank(personOrYear) {
  const year = typeof personOrYear === "string" ? personOrYear : personOrYear?.year;
  return YEAR_ORDER[year] ?? Math.round((YEAR_VALUE[year] ?? 0) * 10) / 10;
}

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
  return group.reduce((sum, person) => sum + getYearRank(person), 0);
}

function averageGroup(group) {
  return group.length ? scoreGroup(group) / group.length : 0;
}

function variance(values) {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
}

function yearDistributionPenaltyForFirstThree(groups) {
  const years = ["Foundation", "Year 1", "Year 2", "Year 3", "Year 4"];
  let penalty = 0;
  for (const year of years) {
    const counts = groups.slice(0, 3).map((g) => g.filter((p) => p.year === year).length);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    penalty += (max - min) * 1.25;
  }
  return penalty;
}

function countByYear(participants) {
  return participants.reduce((acc, person) => {
    acc[person.year] = (acc[person.year] || 0) + 1;
    return acc;
  }, {});
}

function groupSignature(group) {
  return sortMembersByYear(group)
    .map((p) => `${getYearRank(p)}:${p.name}`)
    .join("|");
}

function partitionSignature(groups) {
  return groups.map(groupSignature).join(" || ");
}

function scoreGroup4Rule(group4, allParticipants) {
  const counts = countByYear(allParticipants);
  const hasSeniorAvailable = allParticipants.some((p) => getYearRank(p) >= 3);
  const hasYear2Available = (counts["Year 2"] || 0) > 0;
  const hasYear1Available = (counts["Year 1"] || 0) > 0;
  const foundationAvailable = (counts.Foundation || 0) > 0;

  const ranks = group4.map(getYearRank).sort((a, b) => b - a);
  const hasSenior = group4.some((p) => getYearRank(p) >= 3);
  const hasYear2 = group4.some((p) => p.year === "Year 2");
  const hasYear1 = group4.some((p) => p.year === "Year 1");
  const hasFoundation = group4.some((p) => p.year === "Foundation");

  let penalty = 0;

  // Main event rule: because Group 4 has only two people, it must receive
  // the clearest compensation pair available. With the usual cohort, that is
  // exactly Senior + Year 2, e.g. Year 3 + Year 2.
  if (hasSeniorAvailable && hasYear2Available) {
    if (!(hasSenior && hasYear2)) penalty += 100000;
  } else if (hasSeniorAvailable) {
    if (!hasSenior) penalty += 100000;

    const seniorCount = allParticipants.filter((p) => getYearRank(p) >= 3).length;
    if (seniorCount >= 2) {
      const seniorMembers = group4.filter((p) => getYearRank(p) >= 3).length;
      if (seniorMembers < 2) penalty += 20000;
    } else if (hasYear1Available && !hasYear1) {
      penalty += 6000;
    } else if (!hasYear1Available && foundationAvailable && !hasFoundation) {
      penalty += 3000;
    }
  } else if ((counts["Year 2"] || 0) >= 2) {
    if (group4.filter((p) => p.year === "Year 2").length < 2) penalty += 80000;
  } else if (hasYear2Available) {
    if (!hasYear2) penalty += 60000;
  }

  // Soft preference: keep Group 4 strong, but avoid over-stacking it beyond
  // the practical compensation target when Senior + Year 2 is available.
  const targetTotal = hasSeniorAvailable && hasYear2Available ? 5 : Math.min(6, Math.max(...allParticipants.map(getYearRank)) * 2);
  penalty += Math.abs(scoreGroup(group4) - targetTotal) * 8;
  penalty += (4 - Math.min(4, ranks[0] || 0)) * 2;
  penalty += (2 - Math.min(2, ranks[1] || 0)) * 1.5;

  return penalty;
}

function scoreFullPartition(groups, allParticipants) {
  const firstThree = groups.slice(0, 3);
  const group4 = groups[3];

  const firstThreeTotals = firstThree.map(scoreGroup);
  const firstThreeAverages = firstThree.map(averageGroup);
  const group4Average = averageGroup(group4);
  const firstThreeMeanAverage = firstThreeAverages.reduce((a, b) => a + b, 0) / firstThreeAverages.length;

  let score = 0;

  score += scoreGroup4Rule(group4, allParticipants);

  // Balance Group 1-3 against each other. Group 4 is intentionally compensated
  // separately because it has only two members.
  score += variance(firstThreeTotals) * 18;
  score += variance(firstThreeAverages) * 10;
  score += (Math.max(...firstThreeTotals) - Math.min(...firstThreeTotals)) * 4;
  score += yearDistributionPenaltyForFirstThree(groups);

  // Keep Group 4's average at least as high as the three-person groups.
  if (group4Average < firstThreeMeanAverage) {
    score += (firstThreeMeanAverage - group4Average) * 500;
  }

  // Avoid creating a three-person group with no Year 2+ anchor when anchors
  // are still available in the first three groups.
  const availableAnchorsOutsideG4 = without(allParticipants, group4).filter((p) => getYearRank(p) >= 2).length;
  const anchorlessGroups = firstThree.filter((g) => !g.some((p) => getYearRank(p) >= 2)).length;
  if (availableAnchorsOutsideG4 >= 3) {
    score += anchorlessGroups * 1000;
  } else {
    score += anchorlessGroups * 80;
  }

  // Penalize excessive clumping, e.g. two/three same-year members in one group
  // when the same year could be spread more evenly.
  for (const group of firstThree) {
    const localCounts = countByYear(group);
    const maxSameYear = Math.max(...Object.values(localCounts));
    if (maxSameYear > 1) score += (maxSameYear - 1) * 3;
  }

  return score;
}

function normalizeParticipants(rawParticipants) {
  return [...rawParticipants]
    .map((p, index) => ({
      ...p,
      __id: p.id || `${p.name}-${p.year}-${index}`,
      __score: getYearRank(p)
    }))
    .sort((a, b) => {
      const yearDiff = getYearRank(b) - getYearRank(a);
      if (yearDiff !== 0) return yearDiff;
      return a.name.localeCompare(b.name);
    });
}

export function createBalancedGroups(rawParticipants) {
  if (!rawParticipants || rawParticipants.length === 0) return {};

  const participants = normalizeParticipants(rawParticipants);

  if (participants.length !== 11) {
    return createFallbackGroups(participants);
  }

  let bestGroups = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestSignature = "";

  const group4Options = combinations(participants, 2);

  for (const group4 of group4Options) {
    const remainingAfterG4 = without(participants, group4);
    for (const group1 of combinations(remainingAfterG4, 3)) {
      const remainingAfterG1 = without(remainingAfterG4, group1);
      for (const group2 of combinations(remainingAfterG1, 3)) {
        const group3 = without(remainingAfterG1, group2);
        if (group3.length !== 3) continue;

        const firstThree = canonicalizeFirstThree([group1, group2, group3]);
        const groups = [...firstThree, group4];
        const score = scoreFullPartition(groups, participants);
        const signature = partitionSignature(groups);

        if (score < bestScore - 0.000001 || (Math.abs(score - bestScore) <= 0.000001 && signature < bestSignature)) {
          bestScore = score;
          bestGroups = groups;
          bestSignature = signature;
        }
      }
    }
  }

  const result = {
    "Group 1": bestGroups?.[0] ?? [],
    "Group 2": bestGroups?.[1] ?? [],
    "Group 3": bestGroups?.[2] ?? [],
    "Group 4": bestGroups?.[3] ?? []
  };

  return cleanGroups(result);
}

function canonicalizeFirstThree(groups) {
  return [...groups].sort((a, b) => {
    const scoreDiff = scoreGroup(b) - scoreGroup(a);
    if (scoreDiff !== 0) return scoreDiff;
    return groupSignature(a).localeCompare(groupSignature(b));
  });
}

function createFallbackGroups(participants) {
  const fallback = GROUP_NAMES.reduce((acc, name) => ({ ...acc, [name]: [] }), {});

  participants.forEach((p) => {
    const candidates = GROUP_NAMES.filter((name, idx) => fallback[name].length < GROUP_SIZES[idx]);
    candidates.sort((a, b) => {
      const idxA = GROUP_NAMES.indexOf(a);
      const idxB = GROUP_NAMES.indexOf(b);
      const sizeA = fallback[a].length / GROUP_SIZES[idxA];
      const sizeB = fallback[b].length / GROUP_SIZES[idxB];
      const scoreA = scoreGroup(fallback[a]);
      const scoreB = scoreGroup(fallback[b]);
      return sizeA - sizeB || scoreA - scoreB || idxA - idxB;
    });
    fallback[candidates[0]].push(p);
  });

  return cleanGroups(fallback);
}

function cleanGroups(groups) {
  return Object.fromEntries(
    GROUP_NAMES.map((name) => [
      name,
      sortMembersByYear((groups[name] || []).map(({ __id, __score, ...person }) => person))
    ])
  );
}

export function sortMembersByYear(members) {
  return [...(members || [])].sort((a, b) => {
    const scoreDiff = getYearRank(b) - getYearRank(a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.name.localeCompare(b.name);
  });
}

export function createAnnouncementText(groups) {
  if (!groups || Object.keys(groups).length === 0) return "";
  return GROUP_NAMES
    .filter((groupName) => Array.isArray(groups[groupName]))
    .map((groupName) => {
      const sortedMembers = sortMembersByYear(groups[groupName]);
      const memberText = sortedMembers.map((m) => `${m.name}, ${m.year}`).join(". ");
      return `${groupName} team members. ${memberText}.`;
    })
    .join(" ");
}
