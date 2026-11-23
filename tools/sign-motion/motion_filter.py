"""Conservative quaternion denoising; never a linguistic correctness check."""
import math


def normalize(q):
    length = math.sqrt(sum(x*x for x in q))
    if not math.isfinite(length) or length < 1e-9:
        raise ValueError('Invalid quaternion')
    return tuple(x/length for x in q)


def angle(a, b):
    return math.degrees(2*math.acos(min(1, abs(sum(x*y for x,y in zip(normalize(a), normalize(b)))))))


def blend(a, b, t):
    a, b = normalize(a), normalize(b)
    dot = sum(x*y for x,y in zip(a,b))
    if dot < 0:
        b = tuple(-x for x in b); dot = -dot
    if dot > .9995:
        return normalize(tuple((1-t)*x+t*y for x,y in zip(a,b)))
    theta = math.acos(min(1,dot))
    return tuple((math.sin((1-t)*theta)*x+math.sin(t*theta)*y)/math.sin(theta) for x,y in zip(a,b))


def smooth(track, max_degrees=3):
    if not 0 <= max_degrees <= 10:
        raise ValueError('Correction cap must be between 0 and 10 degrees')
    track = [normalize(q) for q in track]
    result = track.copy()
    for i in range(1,len(track)-1):
        # Large discontinuities may be tracking flips or intentional motion.
        # Do not blur across them; flag them for manual review instead.
        if max(angle(track[i-1],track[i]),angle(track[i],track[i+1]))>60:
            continue
        candidate = blend(track[i], blend(track[i-1],track[i+1],.5),.5)
        delta = angle(track[i],candidate)
        result[i] = blend(track[i],candidate,min(1,max_degrees/delta)) if delta>1e-8 else track[i]
    return result
