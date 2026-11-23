import math
import unittest
from motion_filter import smooth, angle


def q(degrees):
    x=math.radians(degrees)/2
    return (math.cos(x),math.sin(x),0,0)


class FilterTests(unittest.TestCase):
    def test_large_discontinuities_are_left_for_manual_review(self):
        values=[q(0),q(170),q(0)]
        self.assertTrue(all(angle(a,b)<1e-5 for a,b in zip(values,smooth(values))))

    def test_constant_rotation_and_sign_flips_do_not_move(self):
        values=[q(35),tuple(-v for v in q(35)),q(35)]
        self.assertTrue(all(angle(a,b)<1e-5 for a,b in zip(values,smooth(values))))

    def test_spike_reduced_with_capped_change_and_fixed_endpoints(self):
        values=[q(0),q(0),q(30),q(0),q(0)]
        result=smooth(values,3)
        self.assertEqual(result[0],values[0]);self.assertEqual(result[-1],values[-1])
        self.assertTrue(all(angle(a,b)<=3.00001 for a,b in zip(values,result)))
        self.assertLess(angle(result[1],result[2]),30)

    def test_zero_cap_preserves_motion_and_invalid_inputs_fail(self):
        values=[q(0),q(20),q(10)]
        self.assertTrue(all(angle(a,b)<1e-5 for a,b in zip(values,smooth(values,0))))
        with self.assertRaises(ValueError):smooth([(0,0,0,0)])
        with self.assertRaises(ValueError):smooth(values,11)
